import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  getBatchMaterialTransactions,
  getMaterialBalance,
  getMaterialLotBalance,
  postMaterialOpeningBalance,
  postProductionIssue,
  postProductionReturn,
  setMaterialTrackingMode,
} from '../../../src/db/material-inventory-queries';
import { postOpeningBalance, saveTank } from '../../../src/db/liquid-ledger-queries';
import {
  cancelBatch,
  completeBatch,
  createOrder,
  getBatch,
  planOrder,
  recordInput,
  releaseOrder,
  startBatch,
} from '../../../src/db/production-orders-queries';
import { postDirectReceipt } from '../../../src/db/purchasing-queries';
import {
  activateRecipeVersion,
  getRecipeVersion,
  saveRecipe,
  saveRecipeIngredient,
  saveRecipeVersion,
} from '../../../src/db/recipes-queries';
import { createMaterialTestDb, seedRawMaterial, seedSupplierAndLocation } from '../helpers/material-test-db';

const FLOOR_STUB = `
CREATE TABLE IF NOT EXISTS floor_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT, floor_plan_id INTEGER DEFAULT 1, name TEXT NOT NULL,
  equipment_type TEXT DEFAULT 'holding_tank', tracking_mode TEXT DEFAULT 'LEGACY', created_at TEXT DEFAULT (datetime('now'))
);
`;

function seedProofDownWithRawMaterial(db: Database) {
  db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-MAT', 'Test Spirit', 'Vodka', 'Active')`);
  const productId = queryOne<{ id: number }>('SELECT id FROM md_products WHERE product_code = ?', ['PROD-MAT'])!.id;
  db.run(`INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, nominal_abv, active) VALUES ('BS-MAT', 'NGS', 'Neutral Grain Spirit', 96, 1)`);
  const bulkSpiritId = queryOne<{ id: number }>('SELECT id FROM md_bulk_spirits WHERE spirit_code = ?', ['BS-MAT'])!.id;
  const rawId = seedRawMaterial(db);
  setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
  const recipeId = saveRecipe({ product_id: productId, name: 'Test', description: '', recipe_type: 'Proof Down', status: 'Development' });
  const versionId = queryOne<{ id: number }>('SELECT id FROM rc_recipe_versions WHERE recipe_id = ?', [recipeId])!.id;
  const version = getRecipeVersion(versionId)!;
  saveRecipeVersion(versionId, {
    version_label: version.version_label, status: 'Draft', effective_date: null,
    target_batch_size: 1000, batch_size_unit: 'L', target_abv: 40,
    expected_yield_percent: null, expected_final_volume_litres: null,
    target_brix: null, target_ph: null, target_carbonation_volumes: null,
    instructions: '', notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Bulk Spirit', raw_material_id: null, bulk_spirit_id: bulkSpiritId,
    source_lot_id: null, description: 'NGS', quantity: 400, unit: 'L', quantity_basis: 'Per Batch', sequence: 1, optional: 0, notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Raw Material', raw_material_id: rawId, bulk_spirit_id: null,
    source_lot_id: null, description: 'Sugar', quantity: 50, unit: 'kg', quantity_basis: 'Per Batch', sequence: 2, optional: 0, notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Water', raw_material_id: null, bulk_spirit_id: null,
    source_lot_id: null, description: 'Water', quantity: 600, unit: 'L', quantity_basis: 'Per Batch', sequence: 3, optional: 0, notes: '',
  });
  activateRecipeVersion(recipeId, versionId);
  return { productId, recipeId, versionId, rawId };
}

function seedLiquidTanks() {
  const sourceTankId = saveTank({ name: 'NGS', tank_type: 'Spirit Holding', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  const destTankId = saveTank({ name: 'Finished', tank_type: 'Finished Spirit', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  postOpeningBalance({ tankId: sourceTankId, lotType: 'Purchased Bulk Spirit', description: 'NGS', volumeLitres: 5000, abv: 96, effectiveDate: '2026-01-01' });
  const lotId = queryOne<{ id: number }>('SELECT id FROM liq_lots ORDER BY id DESC LIMIT 1')!.id;
  return { sourceTankId, destTankId, lotId };
}

function seedMaterialLot(rawId: number, locA: number, qty: number) {
  db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status) VALUES ('MLT-SEED', 'RAW_MATERIAL', ?, 'Active')`, [rawId]);
  const lotId = queryOne<{ id: number }>('SELECT id FROM mat_lots WHERE lot_code = ?', ['MLT-SEED'])!.id;
  postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: qty, unit: 'kg' });
  return lotId;
}

let db: Database;

describe('Phase 1F production material integration', () => {
  beforeEach(async () => {
    db = await createMaterialTestDb(true);
    db.run(FLOOR_STUB);
  });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('51-52. material inputs pending before completion', () => {
    const { locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial(db);
    const matLotId = seedMaterialLot(rawId, locA, 500);
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: matLotId, sourceLocationId: locA, actualQuantity: 50, unit: 'kg' });
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 500);
    assert.equal(queryOne<{ material_transaction_id: number | null }>('SELECT material_transaction_id FROM prod_batch_inputs WHERE batch_id = ?', [batchId])?.material_transaction_id, null);
  });

  it('53-57. completion posts Production Issue linked to batch and lot', () => {
    const { locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial(db);
    const matLotId = seedMaterialLot(rawId, locA, 500);
    const { sourceTankId, destTankId, lotId } = seedLiquidTanks();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: matLotId, sourceLocationId: locA, actualQuantity: 50, unit: 'kg' });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Variance' });
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 450);
    const matTxs = getBatchMaterialTransactions(batchId);
    assert.equal(matTxs.length, 1);
    assert.equal(matTxs[0]?.transaction_type, 'Production Issue');
    assert.equal(matTxs[0]?.material_lot_id, matLotId);
    assert.ok(queryOne<{ material_transaction_id: number }>('SELECT material_transaction_id FROM prod_batch_inputs WHERE batch_id = ? AND input_type = ?', [batchId, 'Raw Material'])?.material_transaction_id);
  });

  it('58-59. insufficient material blocks completion', () => {
    const { locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial(db);
    const matLotId = seedMaterialLot(rawId, locA, 500);
    const { sourceTankId, destTankId, lotId } = seedLiquidTanks();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: matLotId, sourceLocationId: locA, actualQuantity: 50, unit: 'kg' });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    db.run(`INSERT INTO mat_transactions (transaction_code, transaction_type, transaction_timestamp, material_type, raw_material_id, material_lot_id, source_location_id, quantity, unit, base_quantity, base_unit, notes, created_at)
      VALUES ('MTX-CONSUME', 'Production Issue', datetime('now'), 'RAW_MATERIAL', ?, ?, ?, 460, 'kg', 460, 'kg', 'Other batch', datetime('now'))`, [rawId, matLotId, locA]);
    assert.throws(
      () => completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Test' }),
      /Insufficient/,
    );
    assert.equal(getBatch(batchId)?.status, 'In Progress');
  });

  it('60-61. failed completion rolls back material and liquid', () => {
    const { locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial(db);
    const matLotId = seedMaterialLot(rawId, locA, 500);
    const { sourceTankId, lotId } = seedLiquidTanks();
    const tinyDest = saveTank({ name: 'Tiny', tank_type: 'Finished Spirit', capacity_litres: 10, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: matLotId, sourceLocationId: locA, actualQuantity: 50, unit: 'kg' });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    const matBefore = getMaterialLotBalance(matLotId);
    assert.throws(
      () => completeBatch({ batchId, destinationTankId: tinyDest, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Test' }),
      /capacity/i,
    );
    assert.equal(getMaterialLotBalance(matLotId), matBefore);
    assert.equal(getBatchMaterialTransactions(batchId).length, 0);
  });

  it('62. duplicate completion does not double-issue materials', () => {
    const { locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial(db);
    const matLotId = seedMaterialLot(rawId, locA, 500);
    const { sourceTankId, destTankId, lotId } = seedLiquidTanks();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: matLotId, sourceLocationId: locA, actualQuantity: 50, unit: 'kg' });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Variance' });
    assert.throws(() => completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 100, actualOutputAbv: 40, notes: 'Dup' }), /already completed/i);
    assert.equal(getBatchMaterialTransactions(batchId).length, 1);
  });

  it('63. cancelled pre-completion batch does not issue materials', () => {
    const { locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial(db);
    const matLotId = seedMaterialLot(rawId, locA, 500);
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: matLotId, sourceLocationId: locA, actualQuantity: 50, unit: 'kg' });
    cancelBatch(batchId);
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 500);
  });

  it('64. historical Phase 1E inputs without lot are not retroactively posted', () => {
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial(db);
    const { sourceTankId, destTankId, lotId } = seedLiquidTanks();
    db.run(`INSERT INTO prod_batch_inputs (batch_id, input_type, raw_material_id, actual_quantity, unit, notes, created_at)
      VALUES (1, 'Raw Material', ?, 50, 'kg', 'historical', datetime('now'))`, [rawId]);
    assert.equal(queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM mat_transactions WHERE production_batch_id = 1')?.count, 0);
  });

  it('65. Production Return restores inventory up to net issued', () => {
    const { locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status) VALUES ('MLT-RET', 'RAW_MATERIAL', ?, 'Active')`, [rawId]);
    const lotId = queryOne<{ id: number }>('SELECT id FROM mat_lots WHERE lot_code = ?', ['MLT-RET'])!.id;
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, locationId: locA, quantity: 100, unit: 'kg' });
    postProductionIssue({
      materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, sourceLocationId: locA,
      quantity: 50, unit: 'kg', baseQuantity: 50, baseUnit: 'kg', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-ISSUE',
    });
    postProductionReturn({
      materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, destinationLocationId: locA,
      quantity: 8, unit: 'kg', baseQuantity: 8, baseUnit: 'kg', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-RET',
    });
    assert.equal(getMaterialLotBalance(lotId), 58);
    assert.throws(
      () => postProductionReturn({
        materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotId, destinationLocationId: locA,
        quantity: 50, unit: 'kg', baseQuantity: 50, baseUnit: 'kg', productionOrderId: 1, productionBatchId: 1, transactionGroupId: 'MGO-RET2',
      }),
      /exceeds net issued/,
    );
  });

  it('multiple lots for same requirement', () => {
    const { locA } = seedSupplierAndLocation(db);
    const { productId, recipeId, versionId, rawId } = seedProofDownWithRawMaterial(db);
    db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status) VALUES ('MLT-A', 'RAW_MATERIAL', ?, 'Active')`, [rawId]);
    db.run(`INSERT INTO mat_lots (lot_code, material_type, raw_material_id, status) VALUES ('MLT-B', 'RAW_MATERIAL', ?, 'Active')`, [rawId]);
    const lotA = queryOne<{ id: number }>('SELECT id FROM mat_lots WHERE lot_code = ?', ['MLT-A'])!.id;
    const lotB = queryOne<{ id: number }>('SELECT id FROM mat_lots WHERE lot_code = ?', ['MLT-B'])!.id;
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotA, locationId: locA, quantity: 300, unit: 'kg' });
    postMaterialOpeningBalance({ materialType: 'RAW_MATERIAL', rawMaterialId: rawId, materialLotId: lotB, locationId: locA, quantity: 300, unit: 'kg' });
    const { sourceTankId, destTankId, lotId } = seedLiquidTanks();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: lotA, sourceLocationId: locA, actualQuantity: 300, unit: 'kg' });
    recordInput({ batchId, inputType: 'Raw Material', rawMaterialId: rawId, materialLotId: lotB, sourceLocationId: locA, actualQuantity: 205, unit: 'kg' });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Variance' });
    assert.equal(getBatchMaterialTransactions(batchId).length, 2);
    assert.equal(getMaterialBalance('RAW_MATERIAL', rawId, null).onHand, 95);
  });

  it('legacy inventory_items unchanged by material ledger', () => {
    const before = queryOne<{ quantity: number }>('SELECT quantity FROM inventory_items WHERE name = ?', ['Legacy Sugar'])?.quantity;
    const { supplierId, locA } = seedSupplierAndLocation(db);
    const rawId = seedRawMaterial(db);
    setMaterialTrackingMode('RAW_MATERIAL', rawId, 'LEDGER');
    postDirectReceipt({ supplierId, receivedDate: '2026-01-01', receivingLocationId: locA, materialType: 'RAW_MATERIAL', rawMaterialId: rawId, acceptedQuantity: 100, unit: 'kg' });
    const after = queryOne<{ quantity: number }>('SELECT quantity FROM inventory_items WHERE name = ?', ['Legacy Sugar'])?.quantity;
    assert.equal(after, before);
  });
});
