import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import { COSTING_SCHEMA } from '../../../src/db/costing-schema';
import { createLiquidCostLayer } from '../../../src/db/costing-queries';
import {
  activateMaterialLedgerTracking,
  createMaterialLot,
  postMaterialOpeningBalance,
  postProductionIssue,
  setMaterialTrackingMode,
} from '../../../src/db/material-inventory-queries';
import {
  createLot,
  postOpeningBalance,
  postTransaction,
  saveTank,
} from '../../../src/db/liquid-ledger-queries';
import {
  activateRecipeVersion,
  getRecipeVersion,
  saveRecipe,
  saveRecipeIngredient,
  saveRecipeVersion,
} from '../../../src/db/recipes-queries';
import { addReceiptLine, createReceipt, postDirectReceipt, postReceipt } from '../../../src/db/purchasing-queries';
import {
  createMaterialTestDb,
  mockStorage,
  seedPackagingMaterial,
  seedRawMaterial,
  seedSupplierAndLocation,
} from './material-test-db';

export {
  mockStorage,
  createMaterialTestDb,
  seedPackagingMaterial,
  seedRawMaterial,
  seedSupplierAndLocation,
};

export const FLOOR_STUB = `
CREATE TABLE IF NOT EXISTS floor_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT, floor_plan_id INTEGER DEFAULT 1, name TEXT NOT NULL,
  equipment_type TEXT DEFAULT 'holding_tank', tracking_mode TEXT DEFAULT 'LEGACY', created_at TEXT DEFAULT (datetime('now'))
);
`;

/** Alias for costing integration tests — includes COSTING_SCHEMA via material-test-db. */
export async function createCostingTestDb(includeProduction = false): Promise<Database> {
  const db = await createMaterialTestDb(includeProduction);
  if (includeProduction) db.run(FLOOR_STUB);
  return db;
}

export function countTable(table: string): number {
  return queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0;
}

export function activateLedgerPackaging(db: Database, pkgId?: number): number {
  const id = pkgId ?? seedPackagingMaterial(db);
  setMaterialTrackingMode('PACKAGING_MATERIAL', id, 'LEDGER');
  return id;
}

export function activateLedgerRaw(db: Database, rawId?: number): number {
  const id = rawId ?? seedRawMaterial(db);
  activateMaterialLedgerTracking('RAW_MATERIAL', id, 'COST-TEST');
  return id;
}

export type ReceiptSeedResult = {
  supplierId: number;
  locA: number;
  pkgId: number;
  receiptId: number;
  lotId: number;
  receiptLineId: number;
};

/** Post a LEDGER-tracked packaging receipt with purchase cost layer. */
export function seedReceiptWithCost(
  db: Database,
  opts: {
    quantity?: number;
    unitCost?: number;
    currency?: string;
    unit?: string;
  } = {},
): ReceiptSeedResult {
  const { supplierId, locA } = seedSupplierAndLocation(db);
  const pkgId = activateLedgerPackaging(db);
  const quantity = opts.quantity ?? 1000;
  const receiptId = postDirectReceipt({
    supplierId,
    receivedDate: '2026-01-15',
    receivingLocationId: locA,
    materialType: 'PACKAGING_MATERIAL',
    packagingMaterialId: pkgId,
    acceptedQuantity: quantity,
    unit: opts.unit ?? 'each',
    unitCost: opts.unitCost ?? 0.5,
    currency: opts.currency ?? 'KYD',
  });
  const line = queryOne<{ material_lot_id: number; id: number }>(
    'SELECT material_lot_id, id FROM pur_receipt_lines WHERE receipt_id = ?',
    [receiptId],
  )!;
  return { supplierId, locA, pkgId, receiptId, lotId: line.material_lot_id, receiptLineId: line.id };
}

/** Opening-balance packaging lot with explicit unit cost. */
export function seedPackagingLotWithCost(
  db: Database,
  opts: { quantity?: number; unitCostKyd?: number | null; locId?: number } = {},
): { pkgId: number; lotId: number; locA: number } {
  const { locA } = seedSupplierAndLocation(db);
  const pkgId = activateLedgerPackaging(db);
  const lotId = createMaterialLot({ materialType: 'PACKAGING_MATERIAL', packagingMaterialId: pkgId });
  postMaterialOpeningBalance({
    materialType: 'PACKAGING_MATERIAL',
    packagingMaterialId: pkgId,
    materialLotId: lotId,
    locationId: opts.locId ?? locA,
    quantity: opts.quantity ?? 1000,
    unit: 'each',
    unitCostKyd: opts.unitCostKyd,
  });
  return { pkgId, lotId, locA: opts.locId ?? locA };
}

/** Multi-line receipt for allocation tests (two packaging SKUs). */
export function seedMultiLineReceipt(
  db: Database,
): ReceiptSeedResult & { lotId2: number; receiptLineId2: number; pkgId2: number } {
  const { supplierId, locA } = seedSupplierAndLocation(db);
  const pkgId = activateLedgerPackaging(db);
  db.run(
    `INSERT INTO md_packaging_materials (packaging_code, name, packaging_type, inventory_unit, purchase_unit, units_per_purchase_unit, active, inventory_tracking_mode)
     VALUES ('PKG-CAP', 'Cap', 'Cap', 'each', 'case', 1000, 1, 'LEDGER')`,
  );
  const pkgId2 = queryOne<{ id: number }>('SELECT id FROM md_packaging_materials WHERE packaging_code = ?', ['PKG-CAP'])!.id;

  const receiptId = createReceipt({
    purchaseOrderId: null,
    supplierId,
    receivedDate: '2026-01-15',
    receivingLocationId: locA,
    notes: 'Multi-line receipt',
  });
  addReceiptLine({
    receiptId,
    materialType: 'PACKAGING_MATERIAL',
    packagingMaterialId: pkgId,
    receivedQuantity: 8000,
    acceptedQuantity: 8000,
    unit: 'each',
    unitCost: 1,
    currency: 'KYD',
  });
  addReceiptLine({
    receiptId,
    materialType: 'PACKAGING_MATERIAL',
    packagingMaterialId: pkgId2,
    receivedQuantity: 2000,
    acceptedQuantity: 2000,
    unit: 'each',
    unitCost: 1,
    currency: 'KYD',
  });
  postReceipt(receiptId);

  const lines = queryOne<{ material_lot_id: number; id: number }>(
    'SELECT material_lot_id, id FROM pur_receipt_lines WHERE receipt_id = ? ORDER BY id',
    [receiptId],
  )!;
  const line2 = queryOne<{ material_lot_id: number; id: number }>(
    'SELECT material_lot_id, id FROM pur_receipt_lines WHERE receipt_id = ? ORDER BY id LIMIT 1 OFFSET 1',
    [receiptId],
  )!;

  return {
    supplierId,
    locA,
    pkgId,
    pkgId2,
    receiptId,
    lotId: lines.material_lot_id,
    lotId2: line2.material_lot_id,
    receiptLineId: lines.id,
    receiptLineId2: line2.id,
  };
}

export function seedSpiritTank(db: Database) {
  const sourceTankId = saveTank({
    name: 'NGS Tank',
    tank_type: 'Spirit Holding',
    capacity_litres: 10000,
    minimum_working_volume_litres: null,
    location_id: null,
    floor_equipment_id: null,
    tracking_mode: 'LEDGER',
    status: 'Active',
    notes: '',
  });
  const destTankId = saveTank({
    name: 'Finished Tank',
    tank_type: 'Finished Spirit',
    capacity_litres: 10000,
    minimum_working_volume_litres: null,
    location_id: null,
    floor_equipment_id: null,
    tracking_mode: 'LEDGER',
    status: 'Active',
    notes: '',
  });
  postOpeningBalance({
    tankId: sourceTankId,
    lotType: 'Purchased Bulk Spirit',
    description: 'NGS',
    volumeLitres: 5000,
    abv: 96,
    effectiveDate: '2026-01-01',
  });
  const lotId = queryOne<{ id: number }>('SELECT id FROM liq_lots ORDER BY id DESC LIMIT 1')!.id;
  createLiquidCostLayer({
    liquidLotId: lotId,
    sourceType: 'Bulk Spirit Receipt',
    effectiveDate: '2026-01-01',
    volumeLitres: 5000,
    lpa: 4800,
    inputCostKyd: 60000,
  });
  return { sourceTankId, destTankId, lotId };
}

export function seedProofDownScenario(db: Database) {
  db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-CST', 'Cost Spirit', 'Vodka', 'Active')`);
  const productId = queryOne<{ id: number }>('SELECT id FROM md_products WHERE product_code = ?', ['PROD-CST'])!.id;
  db.run(
    `INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, nominal_abv, active) VALUES ('BS-CST', 'NGS', 'Neutral Grain Spirit', 96, 1)`,
  );
  const bulkSpiritId = queryOne<{ id: number }>('SELECT id FROM md_bulk_spirits WHERE spirit_code = ?', ['BS-CST'])!.id;
  const rawId = activateLedgerRaw(db);
  const recipeId = saveRecipe({
    product_id: productId,
    name: 'Cost Proof Down',
    description: '',
    recipe_type: 'Proof Down',
    status: 'Development',
  });
  const versionId = queryOne<{ id: number }>('SELECT id FROM rc_recipe_versions WHERE recipe_id = ?', [recipeId])!.id;
  const version = getRecipeVersion(versionId)!;
  saveRecipeVersion(versionId, {
    version_label: version.version_label,
    status: 'Draft',
    effective_date: null,
    target_batch_size: 2400,
    batch_size_unit: 'L',
    target_abv: 40,
    expected_yield_percent: null,
    expected_final_volume_litres: null,
    target_brix: null,
    target_ph: null,
    target_carbonation_volumes: null,
    instructions: '',
    notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Bulk Spirit',
    raw_material_id: null,
    bulk_spirit_id: bulkSpiritId,
    source_lot_id: null,
    description: 'NGS',
    quantity: 400,
    unit: 'L',
    quantity_basis: 'Per Batch',
    sequence: 1,
    optional: 0,
    notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Raw Material',
    raw_material_id: rawId,
    bulk_spirit_id: null,
    source_lot_id: null,
    description: 'Sugar',
    quantity: 50,
    unit: 'kg',
    quantity_basis: 'Per Batch',
    sequence: 2,
    optional: 0,
    notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Water',
    raw_material_id: null,
    bulk_spirit_id: null,
    source_lot_id: null,
    description: 'Water',
    quantity: 600,
    unit: 'L',
    quantity_basis: 'Per Batch',
    sequence: 3,
    optional: 0,
    notes: '',
  });
  activateRecipeVersion(recipeId, versionId);
  const tanks = seedSpiritTank(db);
  return { productId, recipeId, versionId, rawId, bulkSpiritId, ...tanks };
}

export function seedBlendScenario(db: Database) {
  const proof = seedProofDownScenario(db);
  db.run(`UPDATE rc_recipes SET recipe_type = 'Blending' WHERE id = ?`, [proof.recipeId]);
  const sourceTankId = saveTank({
    name: 'Blend Source',
    tank_type: 'Spirit Holding',
    capacity_litres: 10000,
    minimum_working_volume_litres: null,
    location_id: null,
    floor_equipment_id: null,
    tracking_mode: 'LEDGER',
    status: 'Active',
    notes: '',
  });
  const destTankId = saveTank({
    name: 'Blend Dest',
    tank_type: 'Finished Spirit',
    capacity_litres: 10000,
    minimum_working_volume_litres: null,
    location_id: null,
    floor_equipment_id: null,
    tracking_mode: 'LEDGER',
    status: 'Active',
    notes: '',
  });
  postOpeningBalance({
    tankId: sourceTankId,
    lotType: 'Hearts',
    description: 'Lot A',
    volumeLitres: 500,
    abv: 40,
    effectiveDate: '2026-01-01',
  });
  const lotA = queryOne<{ id: number }>('SELECT id FROM liq_lots ORDER BY id DESC LIMIT 1')!.id;
  createLiquidCostLayer({
    liquidLotId: lotA,
    sourceType: 'Opening Cost',
    effectiveDate: '2026-01-01',
    volumeLitres: 500,
    lpa: 200,
    inputCostKyd: 6000,
  });
  const lotB = createLot({
    lot_type: 'Hearts',
    product_id: null,
    bulk_spirit_id: null,
    recipe_version_id: null,
    description: 'Lot B',
    initial_volume_litres: 600,
    initial_abv: 60,
    status: 'Active',
    source_type: 'Manual',
    source_reference_id: null,
    parent_lot_id: null,
    notes: '',
  });
  postTransaction({
    transaction_type: 'Bulk Spirit Receipt',
    transaction_timestamp: new Date().toISOString(),
    source_tank_id: null,
    destination_tank_id: sourceTankId,
    source_lot_id: null,
    destination_lot_id: lotB,
    volume_litres: 600,
    abv: 60,
    reason_code: null,
    source_document_type: null,
    source_document_id: null,
    notes: '',
    created_by: null,
  });
  createLiquidCostLayer({
    liquidLotId: lotB,
    sourceType: 'Bulk Spirit Receipt',
    effectiveDate: '2026-01-01',
    volumeLitres: 600,
    lpa: 360,
    inputCostKyd: 4000,
  });
  return { ...proof, sourceTankId, destTankId, lotA, lotB };
}

/** Material lot consumed in a finalized batch — for late landed cost tests. */
export function seedLateLandedCostBatch(db: Database): {
  batchId: number;
  lotId: number;
  receiptId: number;
  supplierId: number;
  locA: number;
  consumptionCost: number;
} {
  const { supplierId, locA, pkgId, receiptId, lotId } = seedReceiptWithCost(db, {
    quantity: 1000,
    unitCost: 0.5,
  });
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
    transactionGroupId: 'MGO-LATE-1',
  });
  db.run(
    `INSERT INTO prod_orders (order_code, product_id, recipe_id, recipe_version_id, production_type, status, planned_batch_size)
     VALUES ('PO-LATE', 1, 1, 1, 'Packaging', 'Completed', 1000)`,
  );
  db.run(
    `INSERT INTO prod_batches (batch_code, production_order_id, status, actual_output_litres, actual_output_abv)
     VALUES ('PB-LATE', 1, 'Completed', 1000, 0)`,
  );
  db.run(
    `INSERT INTO cost_batch_snapshots (production_batch_id, snapshot_type, status, material_cost_kyd, total_cost_kyd, conversion_cost_kyd, unvalued_input_count, created_at, finalized_at)
     VALUES (1, 'Final', 'Finalized', 200, 200, 0, 0, datetime('now'), datetime('now'))`,
  );
  db.run(
    `UPDATE cost_material_consumptions SET production_batch_id = 1, production_order_id = 1 WHERE material_lot_id = ?`,
    [lotId],
  );
  return { batchId: 1, lotId, receiptId, supplierId, locA, consumptionCost: 200 };
}

/** Run COSTING_SCHEMA twice — idempotent browser migration check. */
export function runCostingSchemaTwice(db: Database): void {
  db.run(COSTING_SCHEMA);
  db.run(COSTING_SCHEMA);
}

export function teardownTestDb(): void {
  __injectDatabaseForTests(null);
}
