/**
 * Phase 1M Production Planning, Demand Forecasting & MRP.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import {
  casesToUnits,
  computeNetRequirement,
  detectResourceConflicts,
  explodeRecipeMaterialRequirements,
  normalizeDemandToUnits,
  unitsToCases,
} from '../../../shared/planning/mrp-engine';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  addDemandForecastLine,
  addProductionPlanLine,
  computeSkuDemandSummary,
  createDemandForecast,
  createProductionPlan,
  createScheduleSlot,
  getMrpLines,
  getOpenPoQuantityForMaterial,
  listScheduleConflicts,
  runMrpForProductionPlan,
  upsertSafetyStock,
} from '../../../src/db/planning-queries';
import {
  addPurchaseOrderLine,
  createPurchaseOrder,
  submitPurchaseOrder,
} from '../../../src/db/purchasing-queries';
import {
  createMaterialLot,
  postMaterialOpeningBalance,
  setMaterialTrackingMode,
} from '../../../src/db/material-inventory-queries';
import { teardownTestDb } from '../helpers/costing-test-helpers';
import {
  createPlanningTestDb,
  seedEquipmentId,
  seedProductAndSku,
  seedRecipeWithPackaging,
} from '../helpers/planning-test-helpers';
import {
  seedPackagingMaterial,
  seedRawMaterial,
  seedSupplierAndLocation,
} from '../helpers/material-test-db';

describe('Phase 1M Production Planning & MRP', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  async function setupPlanning(): Promise<{
    skuId: number;
    productId: number;
    packagingId: number;
    rawId: number;
    versionId: number;
    equipmentId: number;
  }> {
    db = await createPlanningTestDb();
    __injectDatabaseForTests(db);
    const { productId, skuId } = seedProductAndSku(db);
    const packagingId = seedPackagingMaterial(db);
    const rawId = seedRawMaterial(db);
    const { versionId } = seedRecipeWithPackaging(db, productId, skuId, packagingId, rawId);
    const equipmentId = seedEquipmentId(db);
    return { skuId, productId, packagingId, rawId, versionId, equipmentId };
  }

  it('converts cases to SKU units and back', () => {
    assert.equal(casesToUnits(10, 12), 120);
    assert.equal(unitsToCases(120, 12), 10);
    assert.equal(normalizeDemandToUnits(5, 'cases', 12), 60);
    assert.equal(normalizeDemandToUnits(60, 'units', 12), 60);
  });

  it('computes net requirement with safety stock and inventory subtraction', () => {
    const net = computeNetRequirement({
      grossRequirement: 100,
      onHandQuantity: 30,
      openPoQuantity: 20,
      safetyStockQuantity: 10,
    });
    assert.equal(net.netRequirement, 60);
    assert.equal(net.shortageQuantity, 60);
    assert.equal(net.recommendedPurchaseQty, 60);
  });

  it('floors net requirement at zero when supply covers demand', () => {
    const net = computeNetRequirement({
      grossRequirement: 50,
      onHandQuantity: 40,
      openPoQuantity: 20,
      safetyStockQuantity: 5,
    });
    assert.equal(net.netRequirement, 0);
    assert.equal(net.shortageQuantity, 0);
  });

  it('aggregates demand forecast lines for a SKU', async () => {
    const { skuId } = await setupPlanning();
    const forecastId = createDemandForecast({
      name: 'Q4 Forecast',
      periodStart: '2026-10-01',
      periodEnd: '2026-12-31',
    });
    addDemandForecastLine({ forecastId, skuId, demandQuantity: 10, quantityUnit: 'cases' });
    addDemandForecastLine({ forecastId, skuId, demandQuantity: 240, quantityUnit: 'units' });
    db.run(`UPDATE plan_demand_forecasts SET status = 'Active' WHERE id = ?`, [forecastId]);
    const summary = computeSkuDemandSummary(skuId);
    assert.equal(summary.grossDemandUnits, 360);
  });

  it('applies safety stock in SKU demand summary', async () => {
    const { skuId } = await setupPlanning();
    const forecastId = createDemandForecast({
      name: 'Week 37',
      periodStart: '2026-09-08',
      periodEnd: '2026-09-14',
    });
    addDemandForecastLine({ forecastId, skuId, demandQuantity: 100, quantityUnit: 'units' });
    upsertSafetyStock({ itemType: 'SKU', skuId, safetyStockQuantity: 25 });
    const summary = computeSkuDemandSummary(skuId, forecastId);
    assert.equal(summary.safetyStockUnits, 25);
    assert.equal(summary.netRequirementUnits, 125);
    assert.equal(summary.shortageUnits, 125);
  });

  it('subtracts open PO quantity in MRP net requirement', async () => {
    const { packagingId, versionId, skuId } = await setupPlanning();
    const { supplierId } = seedSupplierAndLocation(db);
    upsertSafetyStock({ itemType: 'PACKAGING_MATERIAL', packagingMaterialId: packagingId, safetyStockQuantity: 0 });

    const poId = createPurchaseOrder({ supplierId, orderDate: '2026-09-01' });
    addPurchaseOrderLine({
      purchaseOrderId: poId,
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: packagingId,
      orderedQuantity: 500,
      unit: 'case',
      unitPrice: 10,
    });
    submitPurchaseOrder(poId);
    assert.equal(getOpenPoQuantityForMaterial('PACKAGING_MATERIAL', null, packagingId), 500);

    const planId = createProductionPlan({
      name: 'September Pack',
      planStart: '2026-09-01',
      planEnd: '2026-09-30',
    });
    addProductionPlanLine({
      productionPlanId: planId,
      skuId,
      recipeVersionId: versionId,
      plannedQuantity: 1000,
      quantityUnit: 'units',
    });
    const runId = runMrpForProductionPlan(planId);
    const pkgLine = getMrpLines(runId).find((l) => l.packaging_material_id === packagingId);
    assert.ok(pkgLine);
    assert.equal(pkgLine!.gross_requirement, 1000);
    assert.equal(pkgLine!.open_po_quantity, 500);
    assert.equal(pkgLine!.net_requirement, 500);
  });

  it('subtracts on-hand inventory in MRP net requirement', async () => {
    const { packagingId, versionId, skuId } = await setupPlanning();
    const { locA } = seedSupplierAndLocation(db);
    setMaterialTrackingMode('PACKAGING_MATERIAL', packagingId, 'LEDGER');
    const lotId = createMaterialLot({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: packagingId,
    });
    postMaterialOpeningBalance({
      materialType: 'PACKAGING_MATERIAL',
      packagingMaterialId: packagingId,
      materialLotId: lotId,
      locationId: locA,
      quantity: 300,
      unit: 'each',
      effectiveDate: '2026-09-01',
    });

    const planId = createProductionPlan({
      name: 'Pack Run',
      planStart: '2026-09-01',
      planEnd: '2026-09-15',
    });
    addProductionPlanLine({
      productionPlanId: planId,
      skuId,
      recipeVersionId: versionId,
      plannedQuantity: 1000,
      quantityUnit: 'units',
    });
    const runId = runMrpForProductionPlan(planId);
    const pkgLine = getMrpLines(runId).find((l) => l.packaging_material_id === packagingId);
    assert.ok(pkgLine);
    assert.equal(pkgLine!.on_hand_quantity, 300);
    assert.equal(pkgLine!.net_requirement, 700);
  });

  it('scales recipe material requirements for target production quantity', () => {
    const scaled = explodeRecipeMaterialRequirements({
      ingredients: [
        {
          rawMaterialId: 1,
          packagingMaterialId: null,
          ingredientType: 'Sweetener',
          quantity: 50,
          unit: 'kg',
          quantityBasis: 'Per Batch',
        },
        {
          rawMaterialId: null,
          packagingMaterialId: 2,
          ingredientType: 'Packaging',
          quantity: 1000,
          unit: 'each',
          quantityBasis: 'Per Batch',
        },
      ],
      baseBatchOutputUnits: 1000,
      targetOutputUnits: 2000,
    });
    const raw = scaled.find((s) => s.rawMaterialId === 1);
    const pkg = scaled.find((s) => s.packagingMaterialId === 2);
    assert.equal(raw?.grossRequirement, 100);
    assert.equal(pkg?.grossRequirement, 2000);
  });

  it('detects resource conflicts on overlapping schedule slots', async () => {
    const { skuId, equipmentId } = await setupPlanning();
    createScheduleSlot({
      floorEquipmentId: equipmentId,
      skuId,
      scheduledStart: '2026-09-15T08:00:00.000Z',
      scheduledEnd: '2026-09-15T16:00:00.000Z',
    });
    createScheduleSlot({
      floorEquipmentId: equipmentId,
      skuId,
      scheduledStart: '2026-09-15T12:00:00.000Z',
      scheduledEnd: '2026-09-15T20:00:00.000Z',
    });
    const conflicts = listScheduleConflicts();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]?.floorEquipmentId, equipmentId);
  });

  it('does not detect conflict for non-overlapping slots on same equipment', async () => {
    const { skuId, equipmentId } = await setupPlanning();
    createScheduleSlot({
      floorEquipmentId: equipmentId,
      skuId,
      scheduledStart: '2026-09-15T08:00:00.000Z',
      scheduledEnd: '2026-09-15T12:00:00.000Z',
    });
    createScheduleSlot({
      floorEquipmentId: equipmentId,
      skuId,
      scheduledStart: '2026-09-15T13:00:00.000Z',
      scheduledEnd: '2026-09-15T17:00:00.000Z',
    });
    assert.equal(listScheduleConflicts().length, 0);
  });

  it('does not auto-create purchase orders when running MRP', async () => {
    const { versionId, skuId } = await setupPlanning();
    const planId = createProductionPlan({
      name: 'MRP Only',
      planStart: '2026-09-01',
      planEnd: '2026-09-30',
    });
    addProductionPlanLine({
      productionPlanId: planId,
      skuId,
      recipeVersionId: versionId,
      plannedQuantity: 500,
      quantityUnit: 'units',
    });
    const poCountBefore = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pur_purchase_orders')?.count ?? 0;
    runMrpForProductionPlan(planId);
    const poCountAfter = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pur_purchase_orders')?.count ?? 0;
    assert.equal(poCountAfter, poCountBefore);
  });

  it('detectResourceConflicts works as pure function', () => {
    const conflicts = detectResourceConflicts([
      { id: 1, floorEquipmentId: 5, scheduledStart: '2026-09-01T08:00:00Z', scheduledEnd: '2026-09-01T12:00:00Z' },
      { id: 2, floorEquipmentId: 5, scheduledStart: '2026-09-01T11:00:00Z', scheduledEnd: '2026-09-01T15:00:00Z' },
      { id: 3, floorEquipmentId: 6, scheduledStart: '2026-09-01T08:00:00Z', scheduledEnd: '2026-09-01T12:00:00Z' },
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]?.slotAId, 1);
    assert.equal(conflicts[0]?.slotBId, 2);
  });
});
