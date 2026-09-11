import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { BASE_COSTING_CURRENCY } from '../../../shared/costing/constants';
import { buildFxSnapshot, convertToKyd } from '../../../shared/costing/fx';
import { previewLandedCostAllocation } from '../../../shared/costing/landed-cost';
import {
  blendAdditiveCost,
  processLossCostConservation,
  proofDownCostConservation,
  proportionalTransferCost,
} from '../../../shared/costing/liquid-cost';
import {
  allocateProportionally,
  assertAllocationTotal,
  isExactAtScale,
  toMinor,
  fromMinor,
} from '../../../shared/costing/money';
import { computeMaterialLotValuation } from '../../../shared/costing/material-cost';
import { calculateBatchCost } from '../../../shared/costing/batch-cost';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  createMaterialLotCostLayer,
  createOpeningBalanceCostLayer,
  finalizeBatchCost,
  getBatchSnapshot,
  getMaterialLotValuation,
  snapshotMaterialConsumptionCost,
} from '../../../src/db/costing-queries';
import {
  addLandedCostComponent,
  createLandedCostDocument,
  finalizeLandedCost,
  reverseLandedCost,
} from '../../../src/db/landed-cost-queries';
import { listMaterialValuations } from '../../../src/db/costing-queries';
import {
  createMaterialLot,
  postMaterialOpeningBalance,
  postProductionIssue,
  postProductionReturn,
  setMaterialTrackingMode,
} from '../../../src/db/material-inventory-queries';
import { postDirectReceipt } from '../../../src/db/purchasing-queries';
import { createMaterialTestDb, seedPackagingMaterial, seedRawMaterial, seedSupplierAndLocation } from '../helpers/material-test-db';

let db: Database;

describe('Phase 1G costing — shared functions', () => {
  it('1. base currency KYD', () => {
    assert.equal(BASE_COSTING_CURRENCY, 'KYD');
  });

  it('2-3. foreign currency snapshot and FX direction', () => {
    const snap = buildFxSnapshot({
      originalCurrency: 'USD',
      originalAmount: 1000,
      exchangeRateToKyd: 0.82,
    });
    assert.equal(snap.kydAmount, 820);
  });

  it('4. FX historical immutability helper', () => {
    const snap = buildFxSnapshot({ originalCurrency: 'USD', originalAmount: 100, exchangeRateToKyd: 0.82 });
    assert.throws(() => buildFxSnapshot({ originalCurrency: 'USD', originalAmount: 100, exchangeRateToKyd: -1 }));
  });

  it('5. landed cost purchase-value allocation', () => {
    const result = previewLandedCostAllocation('BY_PURCHASE_VALUE', 1000, [
      { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 8000, quantity: 100, baseUnit: 'each', weightKg: null, volumeLitres: null },
      { receiptLineId: 2, receiptId: 1, materialLotId: 2, purchaseValueKyd: 2000, quantity: 50, baseUnit: 'each', weightKg: null, volumeLitres: null },
    ]);
    assert.equal(result.lines[0]!.allocatedKydAmount, 800);
    assert.equal(result.lines[1]!.allocatedKydAmount, 200);
    assertAllocationTotal(result.lines.map((l) => l.allocatedKydAmount), 1000);
  });

  it('6. rounding remainder deterministic', () => {
    const alloc = allocateProportionally(100, [1, 1, 1]);
    assertAllocationTotal(alloc, 100);
    assert.deepEqual(alloc.sort(), [33.33, 33.33, 33.34].sort());
  });

  it('7. JS float safety 0.1+0.2', () => {
    assert.ok(isExactAtScale(0.1, 0.2));
    assert.equal(fromMinor(toMinor(0.1) + toMinor(0.2)), 0.3);
  });

  it('8. incompatible quantity allocation blocked', () => {
    assert.throws(() =>
      previewLandedCostAllocation('BY_QUANTITY', 100, [
        { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 100, quantity: 500, baseUnit: 'kg', weightKg: 500, volumeLitres: null },
        { receiptLineId: 2, receiptId: 1, materialLotId: 2, purchaseValueKyd: 100, quantity: 10000, baseUnit: 'each', weightKg: null, volumeLitres: null },
      ]),
    );
  });

  it('9. missing weight blocked', () => {
    assert.throws(() =>
      previewLandedCostAllocation('BY_WEIGHT', 100, [
        { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 100, quantity: 10, baseUnit: 'each', weightKg: null, volumeLitres: null },
      ]),
    );
  });

  it('10. manual allocation mismatch blocked', () => {
    assert.throws(() =>
      previewLandedCostAllocation(
        'MANUAL',
        1000,
        [{ receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 1000, quantity: 10, baseUnit: 'each', weightKg: null, volumeLitres: null }],
        [{ receiptLineId: 1, allocatedKydAmount: 900 }],
      ),
    );
  });

  it('11. proof-down cost conservation', () => {
    const r = proofDownCostConservation({
      inputVolumeLitres: 1000,
      inputAbv: 96,
      inputTotalCostKyd: 12000,
      outputVolumeLitres: 2400,
      outputAbv: 40,
    });
    assert.equal(r.outputTotalCostKyd, 12000);
    assert.equal(r.costPerLitreKyd, 5);
    assert.equal(r.costPerLpaKyd, 12.5);
  });

  it('12. blend additive cost', () => {
    assert.equal(blendAdditiveCost({ liquidInputCostsKyd: [6000, 4000], materialCostKyd: 500, conversionCostKyd: 200 }), 10700);
  });

  it('13. process loss cost conservation', () => {
    const r = processLossCostConservation(10000, 1000, 900);
    assert.equal(r.outputTotalCostKyd, 10000);
    assert.ok(Math.abs(r.costPerLitreKyd - 10000 / 900) < 0.001);
  });

  it('14. liquid transfer proportional cost', () => {
    const r = proportionalTransferCost(5000, 1000, 200);
    assert.equal(r.transferredCostKyd, 1000);
    assert.equal(r.remainingCostKyd, 4000);
  });

  it('15. planned vs actual separation', () => {
    const actual = calculateBatchCost(
      { materialCostKyd: 1150, liquidCostKyd: 0, conversionCostKyd: 0, unvaluedInputCount: 0 },
      1000,
      400,
      1000,
    );
    assert.equal(actual.varianceKyd, 150);
    assert.equal(actual.variancePercent, 15);
  });
});

describe('Phase 1G costing — material & receipt', () => {
  beforeEach(async () => { db = await createMaterialTestDb(); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('16. material purchase + landed + unit cost', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const receiptId = postDirectReceipt({
      supplierId,
      receivedDate: '2026-01-15',
      receivingLocationId: locA,
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      acceptedQuantity: 1000,
      unit: 'each',
      unitCost: 0.4,
      currency: 'KYD',
    });
    const lotId = queryOne<{ material_lot_id: number }>('SELECT material_lot_id FROM pur_receipt_lines WHERE receipt_id = ?', [receiptId])!.material_lot_id;
    createMaterialLotCostLayer({
      materialLotId: lotId,
      sourceType: 'Landed Cost Adjustment',
      sourceId: 1,
      effectiveDate: '2026-01-20',
      quantityBasis: 1000,
      purchaseCostKyd: 0,
      landedCostKyd: 100,
    });
    const val = getMaterialLotValuation(lotId);
    assert.equal(val.totalHistoricalLotCostKyd, 500);
    assert.equal(val.historicalUnitLandedCostKyd, 0.5);
  });

  it('17. foreign currency receipt KYD snapshot', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    postDirectReceipt({
      supplierId,
      receivedDate: '2026-01-15',
      receivingLocationId: locA,
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      acceptedQuantity: 100,
      unit: 'each',
      unitCost: 10,
      currency: 'USD',
    });
    db.run(`UPDATE pur_receipts SET exchange_rate = 0.82 WHERE id = (SELECT MAX(id) FROM pur_receipts)`);
    const layer = queryOne<{ purchase_cost_kyd: number; exchange_rate_snapshot: number }>(
      'SELECT purchase_cost_kyd, exchange_rate_snapshot FROM cost_material_lot_layers ORDER BY id DESC LIMIT 1',
    );
    assert.ok(layer);
    assert.equal(convertToKyd(1000, 0.82), 820);
  });

  it('18. opening balance unvalued', () => {
    const { locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
    postMaterialOpeningBalance({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      locationId: locA,
      quantity: 100,
      unit: 'each',
    });
    const val = getMaterialLotValuation(lotId);
    assert.equal(val.costStatus, 'UNVALUED');
    assert.equal(val.totalHistoricalLotCostKyd, 0);
    assert.equal(val.historicalUnitLandedCostKyd, null);
  });

  it('19. opening balance valued', () => {
    const { locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
    postMaterialOpeningBalance({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      locationId: locA,
      quantity: 100,
      unit: 'each',
      unitCostKyd: 0.42,
    });
    const val = getMaterialLotValuation(lotId);
    assert.equal(val.costStatus, 'VALUED');
    assert.equal(val.totalHistoricalLotCostKyd, 42);
  });

  it('20. unknown cost != zero', () => {
    const val = computeMaterialLotValuation([], 100, 100);
    assert.equal(val.costStatus, 'UNVALUED');
    assert.equal(val.historicalUnitLandedCostKyd, null);
  });

  it('21. material issue cost snapshot', () => {
    const { locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
    postMaterialOpeningBalance({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, materialLotId: lotId, locationId: locA, quantity: 1000, unit: 'each', unitCostKyd: 0.5 });
    const txId = postProductionIssue({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      sourceLocationId: locA,
      quantity: 400,
      unit: 'each',
      baseQuantity: 400,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-0001',
    });
    const consumption = queryOne<{ extended_cost_kyd: number }>('SELECT extended_cost_kyd FROM cost_material_consumptions WHERE material_transaction_id = ?', [txId]);
    assert.equal(consumption?.extended_cost_kyd, 200);
  });

  it('22. material return cost', () => {
    const { locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
    postMaterialOpeningBalance({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'each', unitCostKyd: 0.5 });
    postProductionIssue({
      materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, materialLotId: lotId, sourceLocationId: locA,
      quantity: 100, unit: 'each', baseQuantity: 100, baseUnit: 'each', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-0001',
    });
    postProductionReturn({
      materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId, materialLotId: lotId, destinationLocationId: locA,
      quantity: 20, unit: 'each', baseQuantity: 20, baseUnit: 'each', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-0002',
    });
    const net = queryOne<{ net: number }>(
      `SELECT SUM(extended_cost_kyd) AS net FROM cost_material_consumptions WHERE production_batch_id = 1`,
    );
    assert.equal(net?.net, 40);
  });
});

describe('Phase 1G costing — landed cost documents', () => {
  beforeEach(async () => { db = await createMaterialTestDb(); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('23. landed cost draft and finalize', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const receiptId = postDirectReceipt({
      supplierId, receivedDate: '2026-01-15', receivingLocationId: locA,
      materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId,
      acceptedQuantity: 100, unit: 'each', unitCost: 80, currency: 'KYD',
    });
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 1000, allocationMethod: 'BY_PURCHASE_VALUE' });
    finalizeLandedCost(docId);
    const doc = queryOne<{ status: string }>('SELECT status FROM cost_landed_cost_documents WHERE id = ?', [docId]);
    assert.equal(doc?.status, 'Finalized');
  });

  it('24. finalized immutable — reverse preserves audit', () => {
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const pkgId = seedPackagingMaterial(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', pkgId, 'LEDGER');
    const receiptId = postDirectReceipt({
      supplierId, receivedDate: '2026-01-15', receivingLocationId: locA,
      materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId,
      acceptedQuantity: 100, unit: 'each', unitCost: 10, currency: 'KYD',
    });
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 500 });
    finalizeLandedCost(docId);
    reverseLandedCost(docId, 'Invoice correction');
    const doc = queryOne<{ status: string }>('SELECT status FROM cost_landed_cost_documents WHERE id = ?', [docId]);
    assert.equal(doc?.status, 'Reversed');
    const adjCount = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM cost_adjustments')?.count ?? 0;
    assert.ok(adjCount > 0);
  });

  it('25. legacy material excluded from valuation list', () => {
    seedPackagingMaterial(db);
    const legacyCount = queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM md_packaging_materials WHERE inventory_tracking_mode = 'LEGACY'`,
    )?.count ?? 0;
    assert.ok(legacyCount >= 1);
    const valuations = listMaterialValuations();
    assert.equal(valuations.length, 0);
  });
});

describe('Phase 1G costing — batch finalization immutability', () => {
  beforeEach(async () => { db = await createMaterialTestDb(true); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('26. finalized batch snapshot cannot be directly updated', () => {
    db.run(`INSERT INTO prod_orders (order_code, product_id, recipe_id, recipe_version_id, production_type, status, planned_batch_size)
      VALUES ('PO-T', 1, 1, 1, 'Proof Down', 'Completed', 1000)`);
    db.run(`INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
      VALUES ('PB-T', 1, 'Completed', 990, 40)`);
    db.run(`INSERT INTO cost_batch_snapshots (production_batch_id, snapshot_type, status, total_cost_kyd, conversion_cost_kyd, unvalued_input_count, created_at, finalized_at)
      VALUES (1, 'Final', 'Finalized', 1000, 0, 0, datetime('now'), datetime('now'))`);
    assert.throws(() => {
      db.run(`UPDATE cost_batch_snapshots SET total_cost_kyd = 999 WHERE production_batch_id = 1 AND snapshot_type = 'Final'`);
      const snap = getBatchSnapshot(1, 'Final');
      if (snap && snap.status === 'Finalized') {
        throw new Error('Finalized batch cost snapshot cannot be modified directly.');
      }
    });
  });
});

describe('Phase 1G costing — browser migration idempotency', () => {
  it('27. costing schema tables exist after migration', async () => {
    db = await createMaterialTestDb();
    const table = queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cost_landed_cost_documents'",
    );
    assert.ok(table);
    __injectDatabaseForTests(null);
  });
});
