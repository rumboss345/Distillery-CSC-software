import { isDatabaseConfigured } from '../config.js';
import { getLocalUserCount } from '../db/auth-local.js';
import { pingDatabase, queryOne } from '../db/pool.js';
import { getMigrationStateRecord, hasSuccessfulImport, isServerApiCutoverReady } from './migration-state.js';
import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface HealthReport {
  ok: boolean;
  application: 'running';
  productionMode: 'browser_local' | 'postgresql';
  postgresql: {
    configured: boolean;
    reachable: boolean | null;
  };
  migrations: {
    current: boolean | null;
    pendingCount: number | null;
  };
  authentication: {
    ready: boolean;
    mode: 'sqlite_local' | 'postgresql';
    userCount: number | null;
  };
  production: {
    migrationState: string;
    imported: boolean;
    serverAuthoritative: boolean;
    serverApiCutoverReady: boolean;
    browserLocalModeActive: boolean;
  };
}

export async function getHealthReport(): Promise<HealthReport> {
  const configured = isDatabaseConfigured();

  if (!configured) {
    const userCount = getLocalUserCount();
    return {
      ok: true,
      application: 'running',
      productionMode: 'browser_local',
      postgresql: { configured: false, reachable: null },
      migrations: { current: null, pendingCount: null },
      authentication: {
        ready: userCount > 0,
        mode: 'sqlite_local',
        userCount,
      },
      production: {
        migrationState: 'LOCAL_ONLY',
        imported: false,
        serverAuthoritative: false,
        serverApiCutoverReady: false,
        browserLocalModeActive: true,
      },
    };
  }

  const reachable = await pingDatabase();

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
    productionMode: 'postgresql',
    postgresql: { configured: true, reachable },
    migrations: { current: migrationsCurrent, pendingCount },
    authentication: {
      ready: (userCount ?? 0) > 0,
      mode: 'postgresql',
      userCount,
    },
    production: {
      migrationState,
      imported,
      serverAuthoritative,
      serverApiCutoverReady: apiReady,
      browserLocalModeActive: !serverAuthoritative,
    },
  };
}
