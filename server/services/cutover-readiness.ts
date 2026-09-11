import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isDatabaseConfigured } from '../config.js';
import { query, queryOne } from '../db/pool.js';
import { ERP_API_DOMAINS } from '../routes/erp/index.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface CutoverReadinessReport {
  ready: boolean;
  migrationsCurrent: boolean;
  pendingMigrationCount: number;
  handlersRegistered: boolean;
  apiDomainsReady: string[];
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

export async function evaluateCutoverReadiness(): Promise<CutoverReadinessReport> {
  const checks: CutoverReadinessReport['checks'] = [];
  let migrationsCurrent = false;
  let pendingMigrationCount = 0;

  if (!isDatabaseConfigured()) {
    checks.push({ name: 'postgresql_configured', passed: false, detail: 'DATABASE_URL not set' });
    return {
      ready: false,
      migrationsCurrent: false,
      pendingMigrationCount: 0,
      handlersRegistered: ERP_API_DOMAINS.length > 0,
      apiDomainsReady: [...ERP_API_DOMAINS],
      checks,
    };
  }

  try {
    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length;
    const appliedRow = await queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM schema_migrations',
    );
    const applied = Number(appliedRow?.count ?? 0);
    pendingMigrationCount = Math.max(0, migrationFiles - applied);
    migrationsCurrent = pendingMigrationCount === 0;
    checks.push({
      name: 'migrations_current',
      passed: migrationsCurrent,
      detail: migrationsCurrent ? 'All migrations applied' : `${pendingMigrationCount} pending`,
    });
  } catch (err) {
    checks.push({
      name: 'migrations_current',
      passed: false,
      detail: err instanceof Error ? err.message : 'Migration check failed',
    });
  }

  const handlersRegistered = ERP_API_DOMAINS.length >= 12;
  checks.push({
    name: 'handlers_registered',
    passed: handlersRegistered,
    detail: `${ERP_API_DOMAINS.length} ERP API domains mounted`,
  });

  const allPassed = checks.every((c) => c.passed);
  const ready = allPassed && migrationsCurrent && handlersRegistered;

  if (ready) {
    await query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('server_api_cutover_ready', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [
        JSON.stringify({
          ready: true,
          evaluatedAt: new Date().toISOString(),
          domains: ERP_API_DOMAINS,
        }),
      ],
    );
  }

  return {
    ready,
    migrationsCurrent,
    pendingMigrationCount,
    handlersRegistered,
    apiDomainsReady: [...ERP_API_DOMAINS],
    checks,
  };
}
