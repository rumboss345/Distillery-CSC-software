/**
 * Step 1A ERP import + reconciliation (requires DATABASE_URL).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, withTransaction } from '../../db/pool.js';
import { runMigrations } from '../../db/migrate.js';
import { createTestBrowserDatabase } from '../helpers/test-browser-db.js';
import { importErpTablesFromSqlJs } from '../../services/sqljs-import/erp-importer.js';
import { buildErpReconciliationReport } from '../../services/reconciliation/erp-reconciliation.js';

const pgConfigured = Boolean(process.env.DATABASE_URL);

describe('Step 1A ERP import integration', { skip: !pgConfigured }, () => {
  before(async () => {
    await runMigrations();
  });

  after(async () => {
    await closePool();
  });

  it('imports ERP tables and reconciles with zero discrepancies on empty DB', async () => {
    const browserDb = await createTestBrowserDatabase();
    let report;
    await withTransaction(async (client) => {
      await importErpTablesFromSqlJs(browserDb, client);
      report = await buildErpReconciliationReport(browserDb, client);
    });
    browserDb.close();
    assert.equal(report!.passed, true);
    assert.equal(report!.discrepancyCount, 0);
  });
});
