import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERP_IMPORT_TABLES, erpTablesInDeleteOrder } from '../../services/sqljs-import/erp-table-registry.js';
import { ERP_API_DOMAINS } from '../../routes/erp/index.js';

describe('Step 1A ERP registry', () => {
  it('lists ERP import tables in FK-safe order', () => {
    assert.ok(ERP_IMPORT_TABLES.length >= 50);
    const mdIdx = ERP_IMPORT_TABLES.findIndex((t) => t.table === 'md_suppliers');
    const matIdx = ERP_IMPORT_TABLES.findIndex((t) => t.table === 'mat_lots');
    const fgIdx = ERP_IMPORT_TABLES.findIndex((t) => t.table === 'fg_transactions');
    assert.ok(mdIdx >= 0 && matIdx > mdIdx && fgIdx > matIdx);
  });

  it('delete order reverses import order', () => {
    const deleteOrder = erpTablesInDeleteOrder();
    assert.equal(deleteOrder[0], ERP_IMPORT_TABLES[ERP_IMPORT_TABLES.length - 1].table);
  });

  it('registers 12 ERP API domains', () => {
    assert.equal(ERP_API_DOMAINS.length, 12);
    assert.ok(ERP_API_DOMAINS.includes('material'));
    assert.ok(ERP_API_DOMAINS.includes('accounting'));
  });
});
