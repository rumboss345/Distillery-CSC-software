/**
 * Step 1A integration certification — records pass in app_settings when all PG checks succeed.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, queryOne, withTransaction } from '../../db/pool.js';
import { runMigrations } from '../../db/migrate.js';
import { createTestBrowserDatabase } from '../helpers/test-browser-db.js';
import { importErpTablesFromSqlJs } from '../../services/sqljs-import/erp-importer.js';
import { buildErpReconciliationReport, persistReconciliationRun } from '../../services/reconciliation/erp-reconciliation.js';
import { evaluateCutoverReadiness, setIntegrationCertified } from '../../services/cutover-readiness.js';
import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const pgConfigured = Boolean(process.env.DATABASE_URL);
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

describe('Step 1A integration certification', { skip: !pgConfigured }, () => {
  before(async () => {
    await runMigrations();
    await setIntegrationCertified(false);
  });

  after(async () => {
    await closePool();
  });

  it('certifies migrations 001-021, import, reconciliation, and readiness gates', async () => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length;
    const applied = await queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM schema_migrations');
    assert.ok(Number(applied?.count ?? 0) >= migrationFiles, 'Migrations not current');

    const browserDb = await createTestBrowserDatabase();
    let report;
    await withTransaction(async (client) => {
      await importErpTablesFromSqlJs(browserDb, client);
      report = await buildErpReconciliationReport(browserDb, client);
      await persistReconciliationRun(report!, 'certification@test.local');
    });
    browserDb.close();

    assert.equal(report!.passed, true, `Reconciliation failed: ${report!.discrepancyCount} discrepancies`);

    await setIntegrationCertified(true);
    const readiness = await evaluateCutoverReadiness();

    assert.equal(readiness.checks.find((c) => c.name === 'integration_certified')?.passed, true);
    assert.equal(readiness.checks.find((c) => c.name === 'reconciliation_passed')?.passed, true);
    assert.equal(readiness.checks.find((c) => c.name === 'migrations_current')?.passed, true);

    // serverApiCutoverReady remains false until human cutover approval (postgres_authoritative not set)
    const row = await queryOne<{ value: { ready?: boolean } }>(
      `SELECT value FROM app_settings WHERE key = 'server_api_cutover_ready'`,
    );
    assert.equal(row?.value?.ready, readiness.ready);
  });
});
