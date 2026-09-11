import { isDatabaseConfigured } from '../config.js';
import { pingDatabase, queryOne } from '../db/pool.js';
import { getMigrationStateRecord, hasSuccessfulImport, isServerApiCutoverReady } from './migration-state.js';
import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface HealthReport {
  ok: boolean;
  application: 'running';
  postgresql: {
    configured: boolean;
    reachable: boolean;
  };
  migrations: {
    current: boolean;
    pendingCount: number | null;
  };
  authentication: {
    ready: boolean;
    userCount: number | null;
  };
  production: {
    migrationState: string;
    imported: boolean;
    serverAuthoritative: boolean;
    serverApiCutoverReady: boolean;
  };
}

export async function getHealthReport(): Promise<HealthReport> {
  const configured = isDatabaseConfigured();
  const reachable = configured ? await pingDatabase() : false;

  let migrationsCurrent = false;
  let pendingCount: number | null = null;
  let userCount: number | null = null;
  let migrationState = 'LOCAL_ONLY';
  let imported = false;
  let serverAuthoritative = false;
  let apiReady = false;

  if (reachable) {
    try {
      const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length;
      const appliedRow = await queryOne<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM schema_migrations',
      );
      const applied = Number(appliedRow?.count ?? 0);
      pendingCount = Math.max(0, migrationFiles - applied);
      migrationsCurrent = pendingCount === 0;

      const users = await queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
      userCount = Number(users?.count ?? 0);

      const stateRecord = await getMigrationStateRecord();
      migrationState = stateRecord.state;
      imported = await hasSuccessfulImport();
      serverAuthoritative = migrationState === 'SERVER_AUTHORITATIVE';
      apiReady = await isServerApiCutoverReady();
    } catch {
      migrationsCurrent = false;
    }
  }

  const ok = reachable && migrationsCurrent && (userCount ?? 0) > 0;

  return {
    ok,
    application: 'running',
    postgresql: { configured, reachable },
    migrations: { current: migrationsCurrent, pendingCount },
    authentication: { ready: (userCount ?? 0) > 0, userCount },
    production: {
      migrationState,
      imported,
      serverAuthoritative,
      serverApiCutoverReady: apiReady,
    },
  };
}
