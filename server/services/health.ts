import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getDatabaseMode, isDatabaseConfigured } from '../config.js';
import { getLocalUserCount } from '../db/auth-local.js';
import { pingDatabase, queryOne } from '../db/pool.js';
import { ERP_API_DOMAINS } from '../routes/erp/index.js';
import { getMigrationStateRecord, hasSuccessfulImport, isServerApiCutoverReady } from './migration-state.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface HealthReport {
  ok: boolean;
  application: 'running';
  productionMode: 'browser_local' | 'postgresql';
  databaseMode: ReturnType<typeof getDatabaseMode>;
  postgresql: {
    configured: boolean;
    reachable: boolean | null;
  };
  migrations: {
    current: boolean | null;
    pendingCount: number | null;
  };
  schemaVersion: string | null;
  reconciliationStatus: {
    lastRunPassed: boolean | null;
    discrepancyCount: number | null;
    lastRunAt: string | null;
  };
  apiDomainsReady: string[];
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

async function loadSchemaVersion(): Promise<string | null> {
  try {
    const row = await queryOne<{ value: { version?: string } }>(
      `SELECT value FROM app_settings WHERE key = 'schema_version'`,
    );
    return row?.value?.version ?? null;
  } catch {
    return null;
  }
}

async function loadReconciliationStatus(): Promise<HealthReport['reconciliationStatus']> {
  try {
    const lastRun = await queryOne<{
      passed: boolean;
      discrepancy_count: number;
      completed_at: string | null;
      created_at: string;
    }>(
      `SELECT passed, discrepancy_count, completed_at, created_at
       FROM erp_reconciliation_runs
       ORDER BY created_at DESC LIMIT 1`,
    );
    if (!lastRun) {
      return { lastRunPassed: null, discrepancyCount: null, lastRunAt: null };
    }
    return {
      lastRunPassed: lastRun.passed,
      discrepancyCount: lastRun.discrepancy_count,
      lastRunAt: lastRun.completed_at ?? lastRun.created_at,
    };
  } catch {
    return { lastRunPassed: null, discrepancyCount: null, lastRunAt: null };
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const configured = isDatabaseConfigured();
  const databaseMode = getDatabaseMode();

  if (!configured) {
    const userCount = getLocalUserCount();
    return {
      ok: true,
      application: 'running',
      productionMode: 'browser_local',
      databaseMode,
      postgresql: { configured: false, reachable: null },
      migrations: { current: null, pendingCount: null },
      schemaVersion: null,
      reconciliationStatus: { lastRunPassed: null, discrepancyCount: null, lastRunAt: null },
      apiDomainsReady: [],
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
  let schemaVersion: string | null = null;
  let reconciliationStatus: HealthReport['reconciliationStatus'] = {
    lastRunPassed: null,
    discrepancyCount: null,
    lastRunAt: null,
  };

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
      schemaVersion = await loadSchemaVersion();
      reconciliationStatus = await loadReconciliationStatus();
    } catch {
      migrationsCurrent = false;
    }
  }

  const ok = reachable && migrationsCurrent && (userCount ?? 0) > 0;

  return {
    ok,
    application: 'running',
    productionMode: 'postgresql',
    databaseMode,
    postgresql: { configured: true, reachable },
    migrations: { current: migrationsCurrent, pendingCount },
    schemaVersion,
    reconciliationStatus,
    apiDomainsReady: [...ERP_API_DOMAINS],
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
