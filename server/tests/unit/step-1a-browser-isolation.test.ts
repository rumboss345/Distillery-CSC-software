/**
 * Step 1A browser-local isolation — authoritative mode must not persist ERP to localStorage.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractErpTablesFromSql, shouldBlockLocalErpRead } from '../../../src/data/server-cache-hydrator.js';
import { ERP_OPERATIONAL_TABLES } from '../../../src/data/erp-table-registry.js';

describe('Step 1A browser isolation helpers', () => {
  it('identifies ERP tables in SQL', () => {
    const tables = extractErpTablesFromSql(
      'SELECT * FROM mat_lots l JOIN mat_transactions t ON t.material_lot_id = l.id',
    );
    assert.ok(tables.includes('mat_lots'));
    assert.ok(tables.includes('mat_transactions'));
  });

  it('covers all critical ERP operational tables in registry', () => {
    const critical = [
      'mat_transactions',
      'liq_transactions',
      'fg_transactions',
      'sal_cogs_records',
      'acct_events',
      'qc_holds',
    ];
    for (const table of critical) {
      assert.ok(ERP_OPERATIONAL_TABLES.includes(table), `Missing ${table}`);
    }
  });

  it('blocks ERP reads before bootstrap in authoritative mode (when mode cached)', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          databaseMode: 'postgres_authoritative',
          serverAuthoritative: true,
          migrationState: 'SERVER_AUTHORITATIVE',
        }),
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    (globalThis as typeof globalThis & { sessionStorage: Storage }).sessionStorage = storage as Storage;

    assert.equal(shouldBlockLocalErpRead('SELECT * FROM mat_lots'), true);
  });
});
