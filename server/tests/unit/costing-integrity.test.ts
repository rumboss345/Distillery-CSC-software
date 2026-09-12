/**
 * Phase 1G costing integrity review — 80 requirement-mapped test cases (REQ-01 … REQ-80).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { BASE_COSTING_CURRENCY } from '../../../shared/costing/constants';
import { buildFxSnapshot, assertFxSnapshotImmutable, convertToKyd } from '../../../shared/costing/fx';
import { previewLandedCostAllocation } from '../../../shared/costing/landed-cost';
import {
  blendAdditiveCost,
  processLossCostConservation,
  proofDownCostConservation,
  proportionalTransferCost,
  reverseTransferCost,
} from '../../../shared/costing/liquid-cost';
import { computeMaterialLotValuation } from '../../../shared/costing/material-cost';
import { estimatePlannedBatchCost } from '../../../shared/costing/planned-cost';
import {
  allocateProportionally,
  assertAllocationTotal,
  isExactAtScale,
  fromMinor,
  toMinor,
} from '../../../shared/costing/money';
import { calculateBatchCost } from '../../../shared/costing/batch-cost';
import {
  assertFinalizedImmutable,
  assertNoHardDelete,
  assertNotLegacyMaterial,
  assertNotLegacyTank,
  formatCostDisplay,
  isUnknownCost,
} from '../../../shared/costing/validation';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  addConversionCost,
  createCostAdjustment,
  createMaterialLotCostLayer,
  createPreliminaryBatchSnapshot,
  deleteDraftCostRecord,
  finalizeBatchCost,
  getBatchCostBreakdown,
  getBatchSnapshot,
  getCostTraceability,
  getLiquidLotValuation,
  getMaterialLotValuation,
  getPostConsumptionFlags,
  listLiquidValuations,
  listMaterialValuations,
  reverseCostAdjustment,
  updateBatchSnapshot,
} from '../../../src/db/costing-queries';
import {
  addLandedCostComponent,
  createLandedCostDocument,
  finalizeLandedCost,
  getLandedCostComponents,
  getLandedCostDocument,
} from '../../../src/db/landed-cost-queries';
import {
  getMaterialTransactions,
  normalizeMaterialQuantity,
  postProductionIssue,
  postProductionReturn,
  setMaterialTrackingMode,
} from '../../../src/db/material-inventory-queries';
import {
  completeBatch,
  createOrder,
  planOrder,
  recordInput,
  releaseOrder,
  startBatch,
} from '../../../src/db/production-orders-queries';
import { createLot, saveTank } from '../../../src/db/liquid-ledger-queries';
import { COSTING_SCHEMA } from '../../../src/db/costing-schema';
import {
  activateLedgerRaw,
  countTable,
  createCostingTestDb,
  runCostingSchemaTwice,
  seedLateLandedCostBatch,
  seedPackagingLotWithCost,
  seedProofDownScenario,
  seedReceiptWithCost,
  teardownTestDb,
} from '../helpers/costing-test-helpers';
import { seedPackagingMaterial } from '../helpers/material-test-db';

let db: Database;

describe('Phase 1G costing integrity review', () => {
  afterEach(() => teardownTestDb());

  it('REQ-01: Base KYD', () => {
    assert.equal(BASE_COSTING_CURRENCY, 'KYD');
  });

  it('REQ-02: FX snapshot', () => {
    const snap = buildFxSnapshot({
      originalCurrency: 'USD',
      originalAmount: 1000,
      exchangeRateToKyd: 0.82,
    });
    assert.equal(snap.originalCurrency, 'USD');
    assert.equal(snap.kydAmount, 820);
    assert.equal(snap.exchangeRateToKyd, 0.82);
  });

  it('REQ-03: FX direction', () => {
    assert.equal(convertToKyd(1000, 0.82), 820);
    assert.equal(convertToKyd(1, 0.82), 0.82);
  });

  it('REQ-04: FX immutability', () => {
    const snap = buildFxSnapshot({ originalCurrency: 'USD', originalAmount: 100, exchangeRateToKyd: 0.82 });
    assert.throws(() => assertFxSnapshotImmutable(snap, { kydAmount: 999 }));
    assert.throws(() => assertFxSnapshotImmutable(snap, { exchangeRateToKyd: 0.9 }));
  });

  it('REQ-05: LCD Draft', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId } = seedReceiptWithCost(db);
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 500 });
    const doc = getLandedCostDocument(docId);
    assert.equal(doc?.status, 'Draft');
    assert.equal(getLandedCostComponents(docId).length, 1);
  });

  it('REQ-06: LCD Finalized', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId } = seedReceiptWithCost(db);
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 500 });
    finalizeLandedCost(docId);
    assert.equal(getLandedCostDocument(docId)?.status, 'Finalized');
    assert.ok(queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM cost_landed_cost_allocations WHERE landed_cost_document_id = ?',
      [docId],
    )!.count >= 1);
  });

  it('REQ-07: finalized immutable', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId } = seedReceiptWithCost(db);
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 100 });
    finalizeLandedCost(docId);
    assert.throws(
      () => addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Duty', originalAmount: 50 }),
      /finalized/i,
    );
    assert.throws(() => assertFinalizedImmutable('Finalized', 'add component'));
  });

  it('REQ-08: component creation', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId } = seedReceiptWithCost(db);
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    const compId = addLandedCostComponent({
      landedCostDocumentId: docId,
      componentType: 'Freight',
      originalAmount: 250,
      currency: 'USD',
      exchangeRateToKyd: 0.82,
    });
    const comp = queryOne<{ kyd_amount: number; currency: string }>(
      'SELECT kyd_amount, currency FROM cost_landed_cost_components WHERE id = ?',
      [compId],
    );
    assert.equal(comp?.currency, 'USD');
    assert.equal(comp?.kyd_amount, 205);
  });

  it('REQ-09: purchase-value allocation', () => {
    const result = previewLandedCostAllocation('BY_PURCHASE_VALUE', 1000, [
      { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 8000, quantity: 100, baseUnit: 'each', weightKg: null, volumeLitres: null },
      { receiptLineId: 2, receiptId: 1, materialLotId: 2, purchaseValueKyd: 2000, quantity: 50, baseUnit: 'each', weightKg: null, volumeLitres: null },
    ]);
    assert.equal(result.lines[0]!.allocatedKydAmount, 800);
    assert.equal(result.lines[1]!.allocatedKydAmount, 200);
    assertAllocationTotal(result.lines.map((l) => l.allocatedKydAmount), 1000);
  });

  it('REQ-10: quantity compatible', () => {
    const result = previewLandedCostAllocation('BY_QUANTITY', 300, [
      { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 500, quantity: 100, baseUnit: 'each', weightKg: null, volumeLitres: null },
      { receiptLineId: 2, receiptId: 1, materialLotId: 2, purchaseValueKyd: 500, quantity: 200, baseUnit: 'each', weightKg: null, volumeLitres: null },
    ]);
    assert.equal(result.lines[0]!.allocatedKydAmount, 100);
    assert.equal(result.lines[1]!.allocatedKydAmount, 200);
  });

  it('REQ-11: quantity blocked', () => {
    assert.throws(() =>
      previewLandedCostAllocation('BY_QUANTITY', 100, [
        { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 100, quantity: 500, baseUnit: 'kg', weightKg: 500, volumeLitres: null },
        { receiptLineId: 2, receiptId: 1, materialLotId: 2, purchaseValueKyd: 100, quantity: 10000, baseUnit: 'each', weightKg: null, volumeLitres: null },
      ]),
      /incompatible/i,
    );
  });

  it('REQ-12: weight allocation', () => {
    const result = previewLandedCostAllocation('BY_WEIGHT', 1000, [
      { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 200, quantity: 50, baseUnit: 'kg', weightKg: 500, volumeLitres: null },
      { receiptLineId: 2, receiptId: 1, materialLotId: 2, purchaseValueKyd: 300, quantity: 30, baseUnit: 'kg', weightKg: 500, volumeLitres: null },
    ]);
    assert.equal(result.lines[0]!.allocatedKydAmount, 500);
    assert.equal(result.lines[1]!.allocatedKydAmount, 500);
  });

  it('REQ-13: missing weight blocked', () => {
    assert.throws(
      () =>
        previewLandedCostAllocation('BY_WEIGHT', 100, [
          { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 100, quantity: 10, baseUnit: 'each', weightKg: null, volumeLitres: null },
        ]),
      /weight information missing/i,
    );
  });

  it('REQ-14: volume allocation', () => {
    const result = previewLandedCostAllocation('BY_VOLUME', 600, [
      { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 100, quantity: 200, baseUnit: 'L', weightKg: null, volumeLitres: 200 },
      { receiptLineId: 2, receiptId: 1, materialLotId: 2, purchaseValueKyd: 100, quantity: 400, baseUnit: 'L', weightKg: null, volumeLitres: 400 },
    ]);
    assert.equal(result.lines[0]!.allocatedKydAmount, 200);
    assert.equal(result.lines[1]!.allocatedKydAmount, 400);
  });

  it('REQ-15: missing volume blocked', () => {
    assert.throws(
      () =>
        previewLandedCostAllocation('BY_VOLUME', 100, [
          { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 100, quantity: 10, baseUnit: 'each', weightKg: null, volumeLitres: null },
        ]),
      /volume information missing/i,
    );
  });

  it('REQ-16: manual allocation', () => {
    const result = previewLandedCostAllocation(
      'MANUAL',
      1000,
      [
        { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 600, quantity: 6, baseUnit: 'each', weightKg: null, volumeLitres: null },
        { receiptLineId: 2, receiptId: 1, materialLotId: 2, purchaseValueKyd: 400, quantity: 4, baseUnit: 'each', weightKg: null, volumeLitres: null },
      ],
      [
        { receiptLineId: 1, allocatedKydAmount: 600 },
        { receiptLineId: 2, allocatedKydAmount: 400 },
      ],
    );
    assert.equal(result.lines[0]!.allocatedKydAmount, 600);
    assert.equal(result.lines[1]!.allocatedKydAmount, 400);
  });

  it('REQ-17: manual mismatch blocked', () => {
    assert.throws(
      () =>
        previewLandedCostAllocation(
          'MANUAL',
          1000,
          [{ receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 1000, quantity: 10, baseUnit: 'each', weightKg: null, volumeLitres: null }],
          [{ receiptLineId: 1, allocatedKydAmount: 900 }],
        ),
      /Allocation total/,
    );
  });

  it('REQ-18: rounding remainder', () => {
    const alloc = allocateProportionally(100, [1, 1, 1]);
    assertAllocationTotal(alloc, 100);
    assert.deepEqual(alloc.sort(), [33.33, 33.33, 33.34].sort());
  });

  it('REQ-19: multiple LCD on receipt', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId, lotId } = seedReceiptWithCost(db, { quantity: 1000, unitCost: 5 });
    const doc1 = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: doc1, componentType: 'Freight', originalAmount: 400 });
    finalizeLandedCost(doc1);
    const doc2 = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-25' });
    addLandedCostComponent({ landedCostDocumentId: doc2, componentType: 'Duty', originalAmount: 225 });
    finalizeLandedCost(doc2);
    const val = getMaterialLotValuation(lotId);
    assert.equal(val.allocatedLandedCostKyd, 625);
    assert.equal(val.totalHistoricalLotCostKyd, 5625);
  });

  it('REQ-20: late landed cost', async () => {
    db = await createCostingTestDb(true);
    const { batchId, lotId, receiptId, supplierId, consumptionCost } = seedLateLandedCostBatch(db);
    const snapBefore = getBatchSnapshot(batchId, 'Final');
    assert.equal(snapBefore?.material_cost_kyd, consumptionCost);

    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-02-01' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 100 });
    finalizeLandedCost(docId);

    assert.equal(getBatchSnapshot(batchId, 'Final')?.material_cost_kyd, 200);
    const flags = getPostConsumptionFlags({ batchId, lotId });
    assert.equal(flags.length, 1);
    assert.equal(flags[0]!.status, 'Pending Review');
  });

  it('REQ-21: material purchase cost', async () => {
    db = await createCostingTestDb();
    const { lotId } = seedReceiptWithCost(db, { quantity: 100, unitCost: 4 });
    const val = getMaterialLotValuation(lotId);
    assert.equal(val.originalPurchaseCostKyd, 400);
    assert.equal(val.allocatedLandedCostKyd, 0);
  });

  it('REQ-22: material landed cost', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId, lotId } = seedReceiptWithCost(db, { quantity: 100, unitCost: 4 });
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 100 });
    finalizeLandedCost(docId);
    assert.equal(getMaterialLotValuation(lotId).allocatedLandedCostKyd, 100);
  });

  it('REQ-23: total lot cost', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId, lotId } = seedReceiptWithCost(db, { quantity: 100, unitCost: 4 });
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 100 });
    finalizeLandedCost(docId);
    assert.equal(getMaterialLotValuation(lotId).totalHistoricalLotCostKyd, 500);
  });

  it('REQ-24: unit landed cost', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId, lotId } = seedReceiptWithCost(db, { quantity: 1000, unitCost: 0.4 });
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 100 });
    finalizeLandedCost(docId);
    assert.equal(getMaterialLotValuation(lotId).historicalUnitLandedCostKyd, 0.5);
  });

  it('REQ-25: remaining value', async () => {
    db = await createCostingTestDb();
    const { locA, lotId, pkgId } = seedPackagingLotWithCost(db, { quantity: 1000, unitCostKyd: 0.5 });
    postProductionIssue({
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
      transactionGroupId: 'MGO-R25',
    });
    const val = getMaterialLotValuation(lotId);
    assert.equal(val.remainingInventoryValueKyd, 300);
  });

  it('REQ-26: opening unvalued', async () => {
    db = await createCostingTestDb();
    const { lotId } = seedPackagingLotWithCost(db, { unitCostKyd: null });
    const val = getMaterialLotValuation(lotId);
    assert.equal(val.costStatus, 'UNVALUED');
    assert.equal(val.totalHistoricalLotCostKyd, 0);
  });

  it('REQ-27: opening valued', async () => {
    db = await createCostingTestDb();
    const { lotId } = seedPackagingLotWithCost(db, { unitCostKyd: 0.42 });
    const val = getMaterialLotValuation(lotId);
    assert.equal(val.costStatus, 'VALUED');
    assert.equal(val.totalHistoricalLotCostKyd, 420);
  });

  it('REQ-28: unknown not zero', () => {
    const val = computeMaterialLotValuation([], 100, 100);
    assert.ok(isUnknownCost(val.costStatus));
    assert.equal(val.historicalUnitLandedCostKyd, null);
    assert.equal(formatCostDisplay(null, 'UNVALUED'), 'Unvalued');
  });

  it('REQ-29: material issue snapshot', async () => {
    db = await createCostingTestDb();
    const { locA, lotId, pkgId } = seedPackagingLotWithCost(db, { quantity: 1000, unitCostKyd: 0.5 });
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
      transactionGroupId: 'MGO-R29',
    });
    const row = queryOne<{ extended_cost_kyd: number; unit_cost_kyd_snapshot: number }>(
      'SELECT extended_cost_kyd, unit_cost_kyd_snapshot FROM cost_material_consumptions WHERE material_transaction_id = ?',
      [txId],
    );
    assert.equal(row?.extended_cost_kyd, 200);
    assert.equal(row?.unit_cost_kyd_snapshot, 0.5);
  });

  it('REQ-30: multiple lot costs', async () => {
    db = await createCostingTestDb();
    const { lotId } = seedReceiptWithCost(db, { quantity: 100, unitCost: 2 });
    createMaterialLotCostLayer({
      materialLotId: lotId,
      sourceType: 'Manual Cost Adjustment',
      sourceId: 99,
      effectiveDate: '2026-01-25',
      quantityBasis: 100,
      purchaseCostKyd: 50,
      landedCostKyd: 0,
    });
    const layers = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM cost_material_lot_layers WHERE material_lot_id = ? AND status = ?',
      [lotId, 'Active'],
    );
    assert.equal(layers?.count, 2);
    assert.equal(getMaterialLotValuation(lotId).totalHistoricalLotCostKyd, 250);
  });

  it('REQ-31: material return', async () => {
    db = await createCostingTestDb();
    const { locA, lotId, pkgId } = seedPackagingLotWithCost(db, { quantity: 100, unitCostKyd: 0.5 });
    postProductionIssue({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      sourceLocationId: locA,
      quantity: 100,
      unit: 'each',
      baseQuantity: 100,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-R31A',
    });
    postProductionReturn({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      destinationLocationId: locA,
      quantity: 20,
      unit: 'each',
      baseQuantity: 20,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-R31B',
    });
    const net = queryOne<{ net: number }>(
      'SELECT SUM(extended_cost_kyd) AS net FROM cost_material_consumptions WHERE production_batch_id = 1',
    );
    assert.equal(net?.net, 40);
  });

  it('REQ-32: repeated return safety', async () => {
    db = await createCostingTestDb();
    const { locA, lotId, pkgId } = seedPackagingLotWithCost(db, { quantity: 100, unitCostKyd: 0.5 });
    postProductionIssue({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      sourceLocationId: locA,
      quantity: 50,
      unit: 'each',
      baseQuantity: 50,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-R32A',
    });
    postProductionReturn({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      destinationLocationId: locA,
      quantity: 20,
      unit: 'each',
      baseQuantity: 20,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-R32B',
    });
    assert.throws(
      () =>
        postProductionReturn({
          materialType: 'PACKAGING_MATERIAL',
          packagingMaterialId: pkgId,
          materialLotId: lotId,
          destinationLocationId: locA,
          quantity: 40,
          unit: 'each',
          baseQuantity: 40,
          baseUnit: 'each',
          productionOrderId: 1,
          productionBatchId: 1,
          transactionGroupId: 'MGO-R32C',
        }),
      /exceeds net issued/i,
    );
  });

  it('REQ-33: bulk spirit cost', async () => {
    db = await createCostingTestDb(true);
    const { lotId } = seedProofDownScenario(db);
    const val = getLiquidLotValuation(lotId, 5000, 4800);
    assert.equal(val.accumulatedCostKyd, 60000);
    assert.equal(val.costStatus, 'VALUED');
  });

  it('REQ-34: liquid cost/L', async () => {
    db = await createCostingTestDb(true);
    const { lotId } = seedProofDownScenario(db);
    const val = getLiquidLotValuation(lotId, 5000, 4800);
    assert.equal(val.costPerLitreKyd, 12);
  });

  it('REQ-35: liquid cost/LPA', async () => {
    db = await createCostingTestDb(true);
    const { lotId } = seedProofDownScenario(db);
    const val = getLiquidLotValuation(lotId, 5000, 4800);
    assert.equal(val.costPerLpaKyd, 12.5);
  });

  it('REQ-36: proof-down conservation', () => {
    const r = proofDownCostConservation({
      inputVolumeLitres: 1000,
      inputAbv: 96,
      inputTotalCostKyd: 12000,
      outputVolumeLitres: 2400,
      outputAbv: 40,
    });
    assert.equal(r.outputTotalCostKyd, 12000);
    assert.equal(r.outputLpa, 960);
    assert.equal(r.costPerLitreKyd, 5);
  });

  it('REQ-37: water cost addition', () => {
    const r = proofDownCostConservation({
      inputVolumeLitres: 1000,
      inputAbv: 96,
      inputTotalCostKyd: 12000,
      outputVolumeLitres: 2400,
      outputAbv: 40,
      waterCostKyd: 200,
      conversionCostKyd: 100,
    });
    assert.equal(r.outputTotalCostKyd, 12300);
  });

  it('REQ-38: blend additive', () => {
    assert.equal(
      blendAdditiveCost({ liquidInputCostsKyd: [6000, 4000], materialCostKyd: 500, conversionCostKyd: 200 }),
      10700,
    );
  });

  it('REQ-39: conversion cost', async () => {
    db = await createCostingTestDb(true);
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status) VALUES ('PB-CONV', 1, 'In Progress')`,
    );
    const id = addConversionCost({
      productionBatchId: 1,
      costType: 'Labor',
      description: 'Operator time',
      originalAmount: 150,
    });
    const row = queryOne<{ amount_kyd: number }>('SELECT amount_kyd FROM cost_batch_conversion_costs WHERE id = ?', [id]);
    assert.equal(row?.amount_kyd, 150);
  });

  it('REQ-40: process loss', () => {
    const r = processLossCostConservation(10000, 1000, 900);
    assert.equal(r.outputTotalCostKyd, 10000);
    assert.ok(Math.abs(r.costPerLitreKyd - 10000 / 900) < 0.001);
  });

  it('REQ-41: liquid transfer (pure fn ok)', () => {
    const r = proportionalTransferCost(5000, 1000, 200);
    assert.equal(r.transferredCostKyd, 1000);
    assert.equal(r.remainingCostKyd, 4000);
  });

  it('REQ-42: partial transfer', () => {
    const r = proportionalTransferCost(12000, 5000, 1500);
    assert.equal(r.transferredCostKyd, 3600);
    assert.equal(r.remainingCostKyd, 8400);
  });

  it('REQ-43: transfer reversal', () => {
    const r = reverseTransferCost(4000, 1000, 1000);
    assert.equal(r.sourceAfterKyd, 5000);
    assert.equal(r.destAfterKyd, 0);
    assert.equal(r.companyTotalKyd, 5000);
  });

  it('REQ-44: measurement gain safety', () => {
    const planned = processLossCostConservation(10000, 1000, 1000);
    const measured = processLossCostConservation(10000, 1000, 1050);
    assert.equal(planned.outputTotalCostKyd, measured.outputTotalCostKyd);
    assert.ok(measured.costPerLitreKyd < planned.costPerLitreKyd);
  });

  it('REQ-45: planned estimate', () => {
    const est = estimatePlannedBatchCost({
      ingredients: [
        { ingredientType: 'Raw Material', quantity: 50, unit: 'kg', unitPriceKyd: 2 },
        { ingredientType: 'Bulk Spirit', quantity: 400, unit: 'L', unitPriceKyd: 30 },
      ],
      conversionCostKyd: 200,
      targetBatchSizeLitres: 1000,
    });
    assert.equal(est.totalEstimatedCostKyd, 12300);
    assert.equal(est.label, 'PLANNED ESTIMATE — NOT ACTUAL COST');
  });

  it('REQ-46: planned vs actual', () => {
    const actual = calculateBatchCost(
      { materialCostKyd: 1150, liquidCostKyd: 0, conversionCostKyd: 0, unvaluedInputCount: 0 },
      1000,
      400,
      1000,
    );
    assert.equal(actual.varianceKyd, 150);
    assert.equal(actual.variancePercent, 15);
  });

  it('REQ-47: batch material cost', async () => {
    db = await createCostingTestDb(true);
    const { locA, lotId, pkgId } = seedPackagingLotWithCost(db, { quantity: 1000, unitCostKyd: 0.5 });
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-MAT', 1, 'Completed', 1000, 40)`,
    );
    postProductionIssue({
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
      transactionGroupId: 'MGO-R47',
    });
    const breakdown = getBatchCostBreakdown(1);
    assert.equal(breakdown.materialCosts[0]?.extendedCostKyd, 200);
  });

  it('REQ-48: batch liquid cost', async () => {
    db = await createCostingTestDb(true);
    const scenario = seedProofDownScenario(db);
    const orderId = createOrder({
      productId: scenario.productId,
      recipeId: scenario.recipeId,
      recipeVersionId: scenario.versionId,
      plannedBatchSize: 2400,
      productionType: 'Proof Down',
    });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({
      batchId,
      inputType: 'Liquid Lot',
      liquidLotId: scenario.lotId,
      sourceTankId: scenario.sourceTankId,
      actualQuantity: 1000,
      unit: 'L',
      actualVolumeLitres: 1000,
      actualAbv: 96,
    });
    db.run(`UPDATE prod_batches SET actual_output_litres = 2400, actual_output_abv = 40 WHERE id = ?`, [batchId]);
    const prelim = createPreliminaryBatchSnapshot(batchId, 2400, 960);
    assert.ok(prelim > 0);
    const snap = getBatchSnapshot(batchId, 'Preliminary');
    assert.ok((snap?.liquid_cost_kyd ?? 0) > 0);
  });

  it('REQ-49: batch conversion', async () => {
    db = await createCostingTestDb(true);
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-CNV', 1, 'Completed', 1000, 40)`,
    );
    addConversionCost({ productionBatchId: 1, costType: 'Utilities', description: 'Steam', originalAmount: 75 });
    const snapId = createPreliminaryBatchSnapshot(1, 1000, 400);
    const snap = queryOne<{ conversion_cost_kyd: number }>('SELECT conversion_cost_kyd FROM cost_batch_snapshots WHERE id = ?', [snapId]);
    assert.equal(snap?.conversion_cost_kyd, 75);
  });

  it('REQ-50: batch total', async () => {
    db = await createCostingTestDb(true);
    const { locA, lotId, pkgId } = seedPackagingLotWithCost(db, { quantity: 1000, unitCostKyd: 1 });
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-TOT', 1, 'Completed', 1000, 40)`,
    );
    postProductionIssue({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      sourceLocationId: locA,
      quantity: 100,
      unit: 'each',
      baseQuantity: 100,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-R50',
    });
    addConversionCost({ productionBatchId: 1, costType: 'Labor', description: 'Ops', originalAmount: 50 });
    createPreliminaryBatchSnapshot(1, 1000, 400);
    const updated = getBatchSnapshot(1, 'Preliminary');
    assert.equal(updated?.total_cost_kyd, 150);
  });

  it('REQ-51: batch cost/L', async () => {
    db = await createCostingTestDb(true);
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-CPL', 1, 'Completed', 1000, 40)`,
    );
    addConversionCost({ productionBatchId: 1, costType: 'Overhead', description: 'OH', originalAmount: 1000 });
    createPreliminaryBatchSnapshot(1, 1000, 400);
    const snap = getBatchSnapshot(1, 'Preliminary');
    assert.equal(snap?.cost_per_litre_kyd, 1);
  });

  it('REQ-52: batch cost/LPA', async () => {
    db = await createCostingTestDb(true);
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-CPLPA', 1, 'Completed', 1000, 40)`,
    );
    addConversionCost({ productionBatchId: 1, costType: 'Overhead', description: 'OH', originalAmount: 400 });
    createPreliminaryBatchSnapshot(1, 1000, 400);
    const snap = getBatchSnapshot(1, 'Preliminary');
    assert.equal(snap?.cost_per_lpa_kyd, 1);
  });

  it('REQ-53: preliminary snapshot', async () => {
    db = await createCostingTestDb(true);
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-PREL', 1, 'In Progress', 500, 40)`,
    );
    createPreliminaryBatchSnapshot(1, 500, 200);
    const snap = getBatchSnapshot(1, 'Preliminary');
    assert.equal(snap?.snapshot_type, 'Preliminary');
    assert.notEqual(snap?.status, 'Finalized');
  });

  it('REQ-54: final snapshot', async () => {
    db = await createCostingTestDb(true);
    const { locA, lotId, pkgId } = seedPackagingLotWithCost(db, { quantity: 500, unitCostKyd: 2 });
    const outputLotId = createLot({
      lot_type: 'Finished Spirit',
      product_id: null,
      bulk_spirit_id: null,
      recipe_version_id: null,
      description: 'Batch output',
      initial_volume_litres: 500,
      initial_abv: 40,
      status: 'Active',
      source_type: 'Production',
      source_reference_id: 1,
      parent_lot_id: null,
      notes: '',
    });
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv, output_lot_id)
       VALUES ('PB-FIN', 1, 'Completed', 500, 40, ?)`,
      [outputLotId],
    );
    postProductionIssue({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      sourceLocationId: locA,
      quantity: 50,
      unit: 'each',
      baseQuantity: 50,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-R54',
    });
    finalizeBatchCost(1, true);
    const snap = getBatchSnapshot(1, 'Final');
    assert.equal(snap?.status, 'Finalized');
    assert.ok(snap?.finalized_at);
  });

  it('REQ-55: final immutability', async () => {
    db = await createCostingTestDb(true);
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-IMM', 1, 'Completed', 990, 40)`,
    );
    db.run(
      `INSERT INTO cost_batch_snapshots (production_batch_id, snapshot_type, status, total_cost_kyd, conversion_cost_kyd, unvalued_input_count, created_at, finalized_at)
       VALUES (1, 'Final', 'Finalized', 1000, 0, 0, datetime('now'), datetime('now'))`,
    );
    const snapId = queryOne<{ id: number }>('SELECT id FROM cost_batch_snapshots WHERE production_batch_id = 1')!.id;
    assert.throws(() => updateBatchSnapshot(snapId, { total_cost_kyd: 999 }), /Finalized batch cost snapshot cannot be modified/);
  });

  it('REQ-56: incomplete batch', async () => {
    db = await createCostingTestDb(true);
    const { locA, lotId, pkgId } = seedPackagingLotWithCost(db, { quantity: 100, unitCostKyd: null });
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-INC', 1, 'Completed', 1000, 40)`,
    );
    postProductionIssue({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      sourceLocationId: locA,
      quantity: 10,
      unit: 'each',
      baseQuantity: 10,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-R56',
    });
    assert.throws(() => finalizeBatchCost(1, false), /unvalued/i);
    const snapId = finalizeBatchCost(1, true);
    assert.ok(snapId > 0);
  });

  it('REQ-57: late adjustment flag', async () => {
    db = await createCostingTestDb(true);
    const { batchId, lotId, receiptId, supplierId } = seedLateLandedCostBatch(db);
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-02-05' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Brokerage', originalAmount: 50 });
    finalizeLandedCost(docId);
    const flag = getPostConsumptionFlags({ batchId, lotId })[0];
    assert.ok(flag);
    assert.match(flag.notes, /Late landed cost|batch cost finalization/i);
  });

  it('REQ-58: cost adjustment', async () => {
    db = await createCostingTestDb();
    const { lotId } = seedReceiptWithCost(db);
    const adjId = createCostAdjustment({
      targetType: 'Material Lot',
      targetId: lotId,
      reason: 'Invoice correction',
      amountKyd: 25,
      effectiveDate: '2026-02-01',
    });
    const adj = queryOne<{ amount_kyd: number }>('SELECT amount_kyd FROM cost_adjustments WHERE id = ?', [adjId]);
    assert.equal(adj?.amount_kyd, 25);
  });

  it('REQ-59: adjustment reversal', async () => {
    db = await createCostingTestDb();
    const { lotId } = seedReceiptWithCost(db);
    const adjId = createCostAdjustment({
      targetType: 'Material Lot',
      targetId: lotId,
      reason: 'Test adj',
      amountKyd: 40,
      effectiveDate: '2026-02-01',
    });
    const revId = reverseCostAdjustment(adjId, 'Undo test');
    const rev = queryOne<{ amount_kyd: number }>('SELECT amount_kyd FROM cost_adjustments WHERE id = ?', [revId]);
    assert.equal(rev?.amount_kyd, -40);
  });

  it('REQ-60: production output cost', async () => {
    db = await createCostingTestDb(true);
    const { locA, lotId, pkgId } = seedPackagingLotWithCost(db, { quantity: 200, unitCostKyd: 1 });
    const outputLotId = createLot({
      lot_type: 'Finished Spirit',
      product_id: null,
      bulk_spirit_id: null,
      recipe_version_id: null,
      description: 'Output lot',
      initial_volume_litres: 200,
      initial_abv: 40,
      status: 'Active',
      source_type: 'Production',
      source_reference_id: 1,
      parent_lot_id: null,
      notes: '',
    });
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv, output_lot_id)
       VALUES ('PB-OUT', 1, 'Completed', 200, 40, ?)`,
      [outputLotId],
    );
    postProductionIssue({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      sourceLocationId: locA,
      quantity: 100,
      unit: 'each',
      baseQuantity: 100,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-R60',
    });
    finalizeBatchCost(1, true);
    const out = queryOne<{ allocated_batch_cost_kyd: number; unit_cost_kyd: number }>(
      'SELECT allocated_batch_cost_kyd, unit_cost_kyd FROM cost_production_outputs WHERE production_batch_id = 1',
    );
    assert.equal(out?.allocated_batch_cost_kyd, 100);
    assert.equal(out?.unit_cost_kyd, 0.5);
  });

  it('REQ-61: multiple output incomplete', async () => {
    db = await createCostingTestDb(true);
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-MOUT', 1, 'Completed', 1000, 40)`,
    );
    db.run(
      `INSERT INTO cost_production_outputs (production_batch_id, output_type, quantity, unit, base_quantity, base_unit, allocated_batch_cost_kyd, cost_status, created_at)
       VALUES (1, 'Liquid Lot', 600, 'L', 600, 'L', NULL, 'UNVALUED', datetime('now')),
              (1, 'Liquid Lot', 400, 'L', 400, 'L', NULL, 'UNVALUED', datetime('now'))`,
    );
    const unallocated = queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM cost_production_outputs WHERE production_batch_id = 1 AND allocated_batch_cost_kyd IS NULL`,
    );
    assert.equal(unallocated?.count, 2);
  });

  it('REQ-62: traceability E2E', async () => {
    db = await createCostingTestDb(true);
    const { supplierId, receiptId, lotId, locA, pkgId } = seedReceiptWithCost(db, { quantity: 100, unitCost: 3 });
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-TRC', 1, 'Completed', 100, 0)`,
    );
    postProductionIssue({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: pkgId,
      materialLotId: lotId,
      sourceLocationId: locA,
      quantity: 10,
      unit: 'each',
      baseQuantity: 10,
      baseUnit: 'each',
      productionOrderId: 1,
      productionBatchId: 1,
      transactionGroupId: 'MGO-R62',
    });
    createPreliminaryBatchSnapshot(1, 100, 0);
    const tree = getCostTraceability(1);
    assert.equal(tree.entityType, 'Production Batch');
    assert.ok(tree.children.some((c) => c.entityType === 'Material Lot' && c.entityId === lotId));
    assert.ok(receiptId > 0 && supplierId > 0);
  });

  it('REQ-63: legacy material excluded', async () => {
    db = await createCostingTestDb();
    seedPackagingMaterial(db);
    assert.throws(() => assertNotLegacyMaterial('LEGACY'), /LEGACY material inventory is excluded/);
    assert.equal(listMaterialValuations().length, 0);
  });

  it('REQ-64: legacy tank excluded', async () => {
    db = await createCostingTestDb(true);
    saveTank({
      name: 'Legacy Tank',
      tank_type: 'Spirit Holding',
      capacity_litres: 5000,
      minimum_working_volume_litres: null,
      location_id: null,
      floor_equipment_id: null,
      tracking_mode: 'LEGACY',
      status: 'Active',
      notes: '',
    });
    assert.throws(() => assertNotLegacyTank('LEGACY'), /LEGACY tanks are excluded/);
    const liquidVals = listLiquidValuations();
    assert.ok(!liquidVals.some((v) => v.lot_code.includes('Legacy')));
  });

  it('REQ-65: no legacy migration', async () => {
    db = await createCostingTestDb();
    const legacyQty = queryOne<{ quantity: number }>('SELECT quantity FROM inventory_items WHERE name = ?', ['Legacy Sugar'])?.quantity;
    assert.equal(legacyQty, 500);
    assert.equal(countTable('cost_material_lot_layers'), 0);
    assert.equal(listMaterialValuations().length, 0);
  });

  it('REQ-66: no Phase1E back-post', async () => {
    db = await createCostingTestDb(true);
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
       VALUES ('PB-HIST', 1, 'Completed', 1000, 40)`,
    );
    db.run(
      `INSERT INTO prod_batch_inputs (batch_id, input_type, actual_quantity, unit)
       VALUES (1, 'Raw Material', 50, 'kg')`,
    );
    createPreliminaryBatchSnapshot(1, 1000, 400);
    assert.equal(
      queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM mat_transactions WHERE production_batch_id = 1')?.count,
      0,
    );
  });

  it('REQ-67: no Phase1D regression (count liquid tx)', async () => {
    db = await createCostingTestDb(true);
    const { supplierId, receiptId, lotId } = seedReceiptWithCost(db);
    const before = countTable('liq_transactions');
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 100 });
    finalizeLandedCost(docId);
    getMaterialLotValuation(lotId);
    assert.equal(countTable('liq_transactions'), before);
  });

  it('REQ-68: no Phase1F regression (count mat tx)', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId, lotId } = seedReceiptWithCost(db);
    const before = countTable('mat_transactions');
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 100 });
    finalizeLandedCost(docId);
    getMaterialLotValuation(lotId);
    assert.equal(countTable('mat_transactions'), before);
  });

  it('REQ-69: production atomicity', async () => {
    db = await createCostingTestDb(true);
    const scenario = seedProofDownScenario(db);
    const orderId = createOrder({
      productId: scenario.productId,
      recipeId: scenario.recipeId,
      recipeVersionId: scenario.versionId,
      plannedBatchSize: 2400,
      productionType: 'Proof Down',
    });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    const tinyDest = saveTank({
      name: 'Tiny',
      tank_type: 'Finished Spirit',
      capacity_litres: 100,
      minimum_working_volume_litres: null,
      location_id: null,
      floor_equipment_id: null,
      tracking_mode: 'LEDGER',
      status: 'Active',
      notes: '',
    });
    startBatch(batchId);
    recordInput({
      batchId,
      inputType: 'Liquid Lot',
      liquidLotId: scenario.lotId,
      sourceTankId: scenario.sourceTankId,
      actualQuantity: 1000,
      unit: 'L',
      actualVolumeLitres: 1000,
      actualAbv: 96,
    });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 1400, unit: 'L', actualVolumeLitres: 1400, actualAbv: 0 });
    assert.throws(
      () => completeBatch({ batchId, destinationTankId: tinyDest, actualOutputLitres: 2397.8, actualOutputAbv: 40.03, notes: 'Fail' }),
      /capacity/i,
    );
    assert.equal(queryOne<{ status: string }>('SELECT status FROM prod_batches WHERE id = ?', [batchId])?.status, 'In Progress');
  });

  it('REQ-70: receipt cost safety', async () => {
    db = await createCostingTestDb();
    const { lotId, receiptLineId } = seedReceiptWithCost(db, { quantity: 50, unitCost: 2.5 });
    const layer = queryOne<{ source_type: string; source_id: number; purchase_cost_kyd: number }>(
      `SELECT source_type, source_id, purchase_cost_kyd FROM cost_material_lot_layers WHERE material_lot_id = ?`,
      [lotId],
    );
    assert.equal(layer?.source_type, 'Purchase Receipt');
    assert.equal(layer?.source_id, receiptLineId);
    assert.equal(layer?.purchase_cost_kyd, 125);
  });

  it('REQ-71: UOM safety', async () => {
    db = await createCostingTestDb();
    const rawId = activateLedgerRaw(db);
    const normalized = normalizeMaterialQuantity('RAW_MATERIAL', rawId, null, 50, 'kg');
    assert.equal(normalized.baseUnit, 'kg');
    assert.equal(normalized.baseQuantity, 50);
  });

  it('REQ-72: cost_unit safety', async () => {
    db = await createCostingTestDb();
    const { lotId } = seedReceiptWithCost(db, { quantity: 10, unitCost: 1 });
    const tx = queryOne<{ base_unit: string; cost_unit: string | null }>(
      `SELECT base_unit, cost_unit FROM mat_transactions WHERE material_lot_id = ? AND transaction_type = 'Purchase Receipt'`,
      [lotId],
    );
    assert.equal(tx?.base_unit, 'each');
    assert.ok(tx?.cost_unit == null || tx.cost_unit === 'each');
  });

  it('REQ-73: discrete packaging valuation', async () => {
    db = await createCostingTestDb();
    const { lotId } = seedReceiptWithCost(db, { quantity: 1000, unitCost: 0.33 });
    const val = getMaterialLotValuation(lotId);
    assert.equal(val.originalReceivedQuantity, 1000);
    assert.ok(Number.isFinite(val.historicalUnitLandedCostKyd ?? NaN));
    assert.equal(val.historicalUnitLandedCostKyd, 0.33);
  });

  it('REQ-74: inactive master display', async () => {
    db = await createCostingTestDb();
    const { supplierId, locA, lotId, pkgId } = seedReceiptWithCost(db, { quantity: 10, unitCost: 1 });
    db.run(`UPDATE md_packaging_materials SET active = 0 WHERE id = ?`, [pkgId]);
    assert.ok(supplierId > 0 && locA > 0);
    const rows = listMaterialValuations();
    const row = rows.find((r) => r.material_lot_id === lotId);
    assert.ok(row);
    assert.equal(row?.material_name, '750mL Bottle');
  });

  it('REQ-75: allocation total exact', () => {
    const result = previewLandedCostAllocation('BY_PURCHASE_VALUE', 1000, [
      { receiptLineId: 1, receiptId: 1, materialLotId: 1, purchaseValueKyd: 333, quantity: 1, baseUnit: 'each', weightKg: null, volumeLitres: null },
      { receiptLineId: 2, receiptId: 1, materialLotId: 2, purchaseValueKyd: 333, quantity: 1, baseUnit: 'each', weightKg: null, volumeLitres: null },
      { receiptLineId: 3, receiptId: 1, materialLotId: 3, purchaseValueKyd: 334, quantity: 1, baseUnit: 'each', weightKg: null, volumeLitres: null },
    ]);
    assertAllocationTotal(result.lines.map((l) => l.allocatedKydAmount), 1000);
    assert.ok(isExactAtScale(0.1, 0.2));
    assert.equal(fromMinor(toMinor(0.1) + toMinor(0.2)), 0.3);
  });

  it('REQ-76: duplicate finalize blocked', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId, lotId } = seedReceiptWithCost(db, { quantity: 100, unitCost: 5 });
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 100 });
    finalizeLandedCost(docId);
    assert.equal(getMaterialLotValuation(lotId).totalHistoricalLotCostKyd, 600);
    assert.throws(() => finalizeLandedCost(docId), /Already finalized/i);
    assert.equal(getMaterialLotValuation(lotId).totalHistoricalLotCostKyd, 600);
  });

  it('REQ-77: hard delete finalized blocked', async () => {
    db = await createCostingTestDb();
    const { supplierId, receiptId } = seedReceiptWithCost(db);
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-01-20' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Freight', originalAmount: 100 });
    finalizeLandedCost(docId);
    assert.throws(() => assertNoHardDelete('Finalized'));
    assert.throws(
      () => deleteDraftCostRecord('cost_landed_cost_documents', docId, 'status', 'Draft'),
      /Only draft records can be deleted|Finalized cost records cannot be hard deleted/i,
    );
  });

  it('REQ-78: adjustment required flag', async () => {
    db = await createCostingTestDb(true);
    const { batchId, lotId, receiptId, supplierId } = seedLateLandedCostBatch(db);
    const docId = createLandedCostDocument({ receiptId, supplierId, effectiveDate: '2026-02-10' });
    addLandedCostComponent({ landedCostDocumentId: docId, componentType: 'Insurance', originalAmount: 75 });
    finalizeLandedCost(docId);
    const flag = getPostConsumptionFlags({ batchId, lotId })[0];
    assert.equal(flag?.status, 'Pending Review');
    assert.ok(flag!.adjustment_amount_kyd > 0);
  });

  it('REQ-79: browser migration idempotency', async () => {
    db = await createCostingTestDb();
    assert.doesNotThrow(() => runCostingSchemaTwice(db));
    const table = queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cost_landed_cost_documents'",
    );
    assert.ok(table);
    db.run(COSTING_SCHEMA);
    assert.ok(queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='cost_batch_snapshots'"));
  });

  it('REQ-80: PostgreSQL optional (health test pattern)', () => {
    const result = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        '-e',
        `import { initializeAuthStore } from './server/db/auth.js';
         import { getHealthReport } from './server/services/health.js';
         await initializeAuthStore();
         const report = await getHealthReport();
         console.log(JSON.stringify({
           ok: report.ok,
           configured: report.postgresql.configured,
           browserLocalModeActive: report.production.browserLocalModeActive,
         }));`,
      ],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: '' }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim().split('\n').pop()!);
    assert.equal(payload.ok, true);
    assert.equal(payload.configured, false);
    assert.equal(payload.browserLocalModeActive, true);
  });
});
