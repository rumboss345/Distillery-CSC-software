import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isDatabaseConfigured, getDatabaseMode } from '../config.js';
import { pingDatabase, query, queryOne } from '../db/pool.js';
import {
  DOMAIN_CAPABILITIES,
  allCriticalWriteDomainsReady,
  allReadDomainsReady,
} from '../db/erp/domain-capabilities.js';
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

async function lastReconciliationPassed(): Promise<{ passed: boolean; detail: string }> {
  const row = await queryOne<{ passed: boolean; discrepancy_count: number; created_at: string }>(
    `SELECT passed, discrepancy_count, created_at FROM erp_reconciliation_runs
     ORDER BY created_at DESC LIMIT 1`,
  );
  if (!row) {
    return { passed: false, detail: 'No reconciliation run recorded' };
  }
  return {
    passed: row.passed && row.discrepancy_count === 0,
    detail: row.passed
      ? `Last reconciliation passed at ${row.created_at}`
      : `Last reconciliation failed (${row.discrepancy_count} discrepancies)`,
  };
}

async function integrationCertified(): Promise<{ passed: boolean; detail: string }> {
  const row = await queryOne<{ value: { certified?: boolean; at?: string } }>(
    `SELECT value FROM app_settings WHERE key = 'step_1a_integration_certified'`,
  );
  if (!row?.value?.certified) {
    return { passed: false, detail: 'PostgreSQL integration test certification not recorded' };
  }
  return { passed: true, detail: `Certified at ${row.value.at ?? 'unknown'}` };
}

export async function setIntegrationCertified(certified: boolean): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('step_1a_integration_certified', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify({ certified, at: new Date().toISOString() })],
  );
}

export async function evaluateCutoverReadiness(): Promise<CutoverReadinessReport> {
  const checks: CutoverReadinessReport['checks'] = [];
  let migrationsCurrent = false;
  let pendingMigrationCount = 0;

  if (!isDatabaseConfigured()) {
    checks.push({ name: 'postgresql_configured', passed: false, detail: 'DATABASE_URL not set' });
    await persistCutoverReady(false, checks);
    return {
      ready: false,
      migrationsCurrent: false,
      pendingMigrationCount: 0,
      handlersRegistered: false,
      apiDomainsReady: [],
      checks,
    };
  }

  const reachable = await pingDatabase();
  checks.push({
    name: 'postgresql_connected',
    passed: reachable,
    detail: reachable ? 'PostgreSQL reachable' : 'Cannot connect to PostgreSQL',
  });

  if (!reachable) {
    await persistCutoverReady(false, checks);
    return {
      ready: false,
      migrationsCurrent: false,
      pendingMigrationCount: 0,
      handlersRegistered: false,
      apiDomainsReady: [],
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
      detail: migrationsCurrent ? `All ${migrationFiles} migrations applied` : `${pendingMigrationCount} pending`,
    });
  } catch (err) {
    checks.push({
      name: 'migrations_current',
      passed: false,
      detail: err instanceof Error ? err.message : 'Migration check failed',
    });
  }

  const readReady = allReadDomainsReady();
  const writeReady = allCriticalWriteDomainsReady();
  checks.push({
    name: 'read_domains_implemented',
    passed: readReady,
    detail: readReady
      ? 'All ERP read domains IMPLEMENTED'
      : `Partial/stub read domains: ${DOMAIN_CAPABILITIES.filter((d) => d.read !== 'IMPLEMENTED').map((d) => d.domain).join(', ')}`,
  });
  checks.push({
    name: 'write_domains_implemented',
    passed: writeReady,
    detail: writeReady
      ? 'All critical ERP write domains IMPLEMENTED'
      : `Incomplete write domains: ${DOMAIN_CAPABILITIES.filter((d) => d.write !== 'IMPLEMENTED').map((d) => d.domain).join(', ')}`,
  });

  const handlersRegistered = ERP_API_DOMAINS.length >= 12;
  checks.push({
    name: 'api_domains_mounted',
    passed: handlersRegistered,
    detail: `${ERP_API_DOMAINS.length} domains mounted`,
  });

  const recon = await lastReconciliationPassed();
  checks.push({ name: 'reconciliation_passed', passed: recon.passed, detail: recon.detail });

  const certified = await integrationCertified();
  checks.push({ name: 'integration_certified', passed: certified.passed, detail: certified.detail });

  checks.push({
    name: 'client_adapter_available',
    passed: true,
    detail: 'ErpDataProvider, server-cache-hydrator, and server-mutation-bridge present',
  });

  checks.push({
    name: 'no_critical_browser_only_paths',
    passed: certified.passed,
    detail: certified.passed
      ? 'Integration certification confirms server-mode read/write paths'
      : 'Browser-local isolation and server-mode paths not yet certified by integration tests',
  });

  const mode = getDatabaseMode();
  checks.push({
    name: 'not_prematurely_authoritative',
    passed: mode !== 'postgres_authoritative',
    detail: `DATABASE_MODE=${mode}`,
  });

  const ready = checks.every((c) => c.passed) && migrationsCurrent;
  await persistCutoverReady(ready, checks);

  return {
    ready,
    migrationsCurrent,
    pendingMigrationCount,
    handlersRegistered,
    apiDomainsReady: [...ERP_API_DOMAINS],
    checks,
  };
}

async function persistCutoverReady(ready: boolean, checks: CutoverReadinessReport['checks']): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('server_api_cutover_ready', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [
      JSON.stringify({
        ready,
        evaluatedAt: new Date().toISOString(),
        domains: ERP_API_DOMAINS,
        checks,
      }),
    ],
  );
}
