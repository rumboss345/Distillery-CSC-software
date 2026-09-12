/**
 * Phase 1O Management Dashboard, Reports & KPI Analytics.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { rowsToCsv } from '../../../src/lib/csv-export';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  assertLedgerOnlyReportingViews,
  getExecutiveDashboardSummary,
  getFgInventoryReport,
  getMaterialInventoryReport,
  getOpenPurchasingReport,
  getProductionKpiReport,
  listUnvaluedInventoryWarnings,
} from '../../../src/db/reporting-queries';
import { REPORTING_SCHEMA } from '../../../src/db/reporting-schema';
import { teardownTestDb } from '../helpers/costing-test-helpers';
import {
  createReportingTestDb,
  seedSalesScenario,
} from '../helpers/reporting-test-helpers';
import {
  addPurchaseOrderLine,
  createPurchaseOrder,
  submitPurchaseOrder,
} from '../../../src/db/purchasing-queries';
import { seedPackagingMaterial, seedSupplierAndLocation } from '../helpers/material-test-db';

describe('Phase 1O Management Dashboard & Reports', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  it('creates ledger-scoped reporting views', async () => {
    db = await createReportingTestDb();
    assert.equal(assertLedgerOnlyReportingViews(), true);
    const matView = queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='view' AND name='rpt_v_mat_ledger_tx'",
    );
    assert.ok(matView);
  });

  it('executive dashboard aggregates FG value and operational COGS from ledger sources', async () => {
    db = await createReportingTestDb();
    await seedSalesScenario(db);
    const summary = getExecutiveDashboardSummary();
    assert.ok(summary.fgValueKyd != null && summary.fgValueKyd > 0);
    assert.equal(summary.fgDepletionUnits, 0);
    assert.equal(summary.operationalCogsKyd, 0);
    assert.ok(summary.valuationStatus === 'FULLY_VALUED' || summary.valuationStatus === 'PARTIALLY_VALUED');
  });

  it('material inventory report includes only LEDGER-tracked lots', async () => {
    db = await createReportingTestDb();
    await seedSalesScenario(db);
    db.run(`INSERT INTO md_raw_materials (material_code, name, material_type, inventory_unit, purchase_unit, inventory_tracking_mode, active)
            VALUES ('LEG-001', 'Legacy Grain', 'Grain', 'lb', 'bag', 'LEGACY', 1)`);
    db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, received_date, status)
            VALUES ('LEG-LOT', 'RAW_MATERIAL', (SELECT id FROM md_raw_materials WHERE material_code = 'LEG-001'), '2026-01-01', 'Active')`);
    const rows = getMaterialInventoryReport();
    assert.ok(rows.every((row) => row.lotCode !== 'LEG-LOT'));
  });

  it('FG inventory report uses fg transaction ledger balances', async () => {
    db = await createReportingTestDb();
    const seed = await seedSalesScenario(db);
    const rows = getFgInventoryReport();
    assert.ok(rows.some((row) => row.fgLotCode && row.quantity > 0));
    assert.ok(rows.some((row) => row.skuCode));
    void seed;
  });

  it('open purchasing report lists outstanding PO lines', async () => {
    db = await createReportingTestDb();
    const { locA, supplierId } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    const poId = createPurchaseOrder({
      supplierId,
      orderDate: '2026-03-01',
      shipToLocationId: locA,
    });
    addPurchaseOrderLine({
      purchaseOrderId: poId,
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      orderedQuantity: 1000,
      unit: 'each',
      unitPrice: 1.5,
    });
    submitPurchaseOrder(poId);
    const summary = getExecutiveDashboardSummary();
    assert.ok(summary.poOutstanding >= 1);
    const rows = getOpenPurchasingReport();
    assert.ok(rows.some((row) => row.remainingQty > 0));
  });

  it('production KPI report returns batch-centric rows', async () => {
    db = await createReportingTestDb();
    await seedSalesScenario(db);
    const rows = getProductionKpiReport();
    assert.ok(Array.isArray(rows));
  });

  it('lists unvalued inventory warnings separately by inventory type', async () => {
    db = await createReportingTestDb();
    await seedSalesScenario(db);
    const warnings = listUnvaluedInventoryWarnings();
    assert.ok(Array.isArray(warnings));
    for (const warning of warnings) {
      assert.ok(['Material', 'Liquid', 'Finished Goods'].includes(warning.inventoryType));
    }
  });

  it('exports CSV rows with proper escaping', () => {
    const csv = rowsToCsv(['a', 'b'], [{ a: 'hello, world', b: 'line\nbreak' }]);
    assert.match(csv, /"hello, world"/);
    assert.match(csv, /"line\nbreak"/);
  });

  it('reporting schema migration is idempotent', async () => {
    db = await createReportingTestDb();
    db.run(REPORTING_SCHEMA);
    assert.equal(assertLedgerOnlyReportingViews(), true);
  });
});
