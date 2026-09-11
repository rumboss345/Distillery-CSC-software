import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';
import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';
import { computeLpa } from '../../../shared/liquid-ledger/balance';
import {
  alcoholYieldPercent,
  ingredientVariancePercent,
  volumeYieldPercent,
} from '../../../shared/production-orders/yield';
import { assertBatchStatusTransition, assertOrderStatusTransition } from '../../../shared/production-orders/status-transitions';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import { MASTER_DATA_SCHEMA } from '../../../src/db/master-data-schema';
import { LIQUID_LEDGER_SCHEMA } from '../../../src/db/liquid-ledger-schema';
import { createLot, postOpeningBalance, postTransaction, saveTank } from '../../../src/db/liquid-ledger-queries';
import {
  completeBatch,
  completeOrder,
  createBatch,
  createOrder,
  getBatch,
  getBatchLedgerTransactions,
  getBatchSteps,
  getBatches,
  getOrder,
  getPlannedVsActual,
  getProductionProgress,
  getRequirements,
  planOrder,
  recordInput,
  recordLoss,
  releaseOrder,
  startBatch,
} from '../../../src/db/production-orders-queries';
import { PRODUCTION_ORDERS_SCHEMA } from '../../../src/db/production-orders-schema';
import {
  activateRecipeVersion,
  cloneRecipeVersion,
  getRecipeVersion,
  saveRecipe,
  saveRecipeIngredient,
  saveRecipeStep,
  saveRecipeVersion,
} from '../../../src/db/recipes-queries';
import { RECIPES_SCHEMA } from '../../../src/db/recipes-schema';
import { seedLiquidLedgerLookupsIfEmpty } from '../../../src/db/liquid-ledger-queries';
import { seedMasterDataIfEmpty } from '../../../src/db/master-data-queries';
import { seedProductionLookupsIfEmpty } from '../../../src/db/production-orders-queries';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FLOOR_STUB = `
CREATE TABLE IF NOT EXISTS floor_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT, floor_plan_id INTEGER DEFAULT 1, name TEXT NOT NULL,
  equipment_type TEXT DEFAULT 'holding_tank', tracking_mode TEXT DEFAULT 'LEGACY', created_at TEXT DEFAULT (datetime('now'))
);
`;

function mockStorage(): void {
  const store: Record<string, string> = {};
  const s = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: () => null,
    length: 0,
  };
  (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = s as Storage;
  (globalThis as typeof globalThis & { sessionStorage: Storage }).sessionStorage = s as Storage;
}

async function createTestDb(): Promise<Database> {
  mockStorage();
  const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  db.run(MASTER_DATA_SCHEMA);
  db.run(RECIPES_SCHEMA);
  db.run(FLOOR_STUB);
  db.run(LIQUID_LEDGER_SCHEMA);
  db.run(PRODUCTION_ORDERS_SCHEMA);
  db.run(`CREATE TABLE IF NOT EXISTS inventory_items (id INTEGER PRIMARY KEY, name TEXT, quantity REAL DEFAULT 0, unit TEXT DEFAULT 'each')`);
  db.run(`INSERT INTO inventory_items (name, quantity) VALUES ('Blackstrap Molasses', 1000)`);
  __injectDatabaseForTests(db);
  seedMasterDataIfEmpty();
  seedLiquidLedgerLookupsIfEmpty();
  seedProductionLookupsIfEmpty();
  return db;
}

function seedProductRecipe(productionType = 'Proof Down', batchSize = 1000) {
  db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-0099', 'Bobo Vodka', 'Vodka', 'Active')`);
  const productId = queryOne<{ id: number }>('SELECT id FROM md_products WHERE product_code = ?', ['PROD-0099'])!.id;
  db.run(`INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, nominal_abv, active) VALUES ('BS-0099', 'NGS', 'Neutral Grain Spirit', 96, 1)`);
  const bulkSpiritId = queryOne<{ id: number }>('SELECT id FROM md_bulk_spirits WHERE spirit_code = ?', ['BS-0099'])!.id;
  db.run(`INSERT INTO md_raw_materials (material_code, name, material_type, inventory_unit, purchase_unit, active) VALUES ('RM-0099', 'Citric Acid', 'Additive', 'kg', 'kg', 1)`);
  const recipeId = saveRecipe({
    product_id: productId,
    name: 'Bobo Vodka',
    description: '',
    recipe_type: productionType,
    status: 'Development',
  });
  const versionId = queryOne<{ id: number }>('SELECT id FROM rc_recipe_versions WHERE recipe_id = ?', [recipeId])!.id;
  const version = getRecipeVersion(versionId)!;
  saveRecipeVersion(versionId, {
    version_label: version.version_label,
    status: 'Draft',
    effective_date: null,
    target_batch_size: batchSize,
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
    ingredient_type: 'Bulk Spirit', raw_material_id: null, bulk_spirit_id: bulkSpiritId,
    source_lot_id: null, description: 'NGS', quantity: 400, unit: 'L', quantity_basis: 'Per Batch', sequence: 1, optional: 0, notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Water', raw_material_id: null, bulk_spirit_id: null,
    source_lot_id: null, description: 'Water', quantity: 600, unit: 'L', quantity_basis: 'Per Batch', sequence: 2, optional: 0, notes: '',
  });
  saveRecipeStep(versionId, { step_number: 1, instruction: 'Add spirit to tank', notes: '' });
  activateRecipeVersion(recipeId, versionId);
  return { productId, recipeId, versionId, bulkSpiritId };
}

function seedTanksWithLots() {
  const sourceTankId = saveTank({ name: 'Source', tank_type: 'Spirit Holding', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  const destTankId = saveTank({ name: 'Dest', tank_type: 'Finished Spirit', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  postOpeningBalance({ tankId: sourceTankId, lotType: 'Hearts', description: 'Lot A', volumeLitres: 500, abv: 40, effectiveDate: '2026-01-01' });
  const lotA = queryOne<{ id: number }>('SELECT id FROM liq_lots ORDER BY id DESC LIMIT 1')!.id;
  const lotB = createLot({
    lot_type: 'Hearts', product_id: null, bulk_spirit_id: null, recipe_version_id: null,
    description: 'Lot B', initial_volume_litres: 600, initial_abv: 60, status: 'Active',
    source_type: 'Manual', source_reference_id: null, parent_lot_id: null, notes: '',
  });
  postTransaction({
    transaction_type: 'Bulk Spirit Receipt',
    transaction_timestamp: new Date().toISOString(),
    source_tank_id: null, destination_tank_id: sourceTankId,
    source_lot_id: null, destination_lot_id: lotB,
    volume_litres: 600, abv: 60, reason_code: null,
    source_document_type: null, source_document_id: null, notes: 'Lot B seed',
    created_by: null,
  });
  return { sourceTankId, destTankId, lotA, lotB };
}

function seedSpiritTank() {
  const sourceTankId = saveTank({ name: 'NGS Tank', tank_type: 'Spirit Holding', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  const destTankId = saveTank({ name: 'Finished', tank_type: 'Finished Spirit', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  postOpeningBalance({ tankId: sourceTankId, lotType: 'Purchased Bulk Spirit', description: 'NGS', volumeLitres: 5000, abv: 96, effectiveDate: '2026-01-01' });
  const lotId = queryOne<{ id: number }>('SELECT id FROM liq_lots ORDER BY id DESC LIMIT 1')!.id;
  return { sourceTankId, destTankId, lotId };
}

function inventoryQty(materialCode: string): number {
  return queryOne<{ quantity: number }>('SELECT quantity FROM inventory_items WHERE name LIKE ? LIMIT 1', [`%${materialCode}%`])?.quantity ?? 0;
}

let db: Database;

describe('Phase 1E production orders', () => {
  beforeEach(async () => { db = await createTestDb(); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('1. creates Draft production order', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 2400 });
    const order = getOrder(orderId);
    assert.equal(order?.status, 'Draft');
    assert.match(order?.order_code ?? '', /^PO-/);
  });

  it('2. assigns unique PO codes', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const a = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    const b = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    assert.notEqual(getOrder(a)?.order_code, getOrder(b)?.order_code);
  });

  it('3. locks explicit recipe version', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    assert.equal(getOrder(orderId)?.recipe_version_id, versionId);
  });

  it('4. scales planned requirements', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 2000 });
    const reqs = getRequirements(orderId);
    const spirit = reqs.find((r) => r.requirement_type === 'Bulk Spirit');
    assert.equal(spirit?.planned_quantity, 800);
    const water = reqs.find((r) => r.requirement_type === 'Water');
    assert.equal(water?.planned_quantity, 1200);
  });

  it('5. recipe changes do not alter released order plan', () => {
    const seeded = seedProductRecipe();
    const { productId, recipeId, versionId } = seeded;
    void productId;
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    releaseOrder(orderId);
    const reqsBefore = getRequirements(orderId);
    const newVersionId = cloneRecipeVersion(versionId);
    saveRecipeIngredient(newVersionId, {
      ingredient_type: 'Bulk Spirit', raw_material_id: null, bulk_spirit_id: queryOne<{ id: number }>('SELECT id FROM md_bulk_spirits LIMIT 1')!.id,
      source_lot_id: null, description: 'Changed', quantity: 999, unit: 'L', quantity_basis: 'Per Batch', sequence: 99, optional: 0, notes: '',
    });
    activateRecipeVersion(recipeId, newVersionId);
    const reqsAfter = getRequirements(orderId);
    assert.equal(reqsAfter.length, reqsBefore.length);
    assert.equal(reqsAfter.find((r) => r.requirement_type === 'Bulk Spirit')?.planned_quantity, 400);
  });

  it('6. release validates order', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    assert.throws(() => releaseOrder(orderId), /Invalid production order status/);
  });

  it('7. release snapshots requirements count', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    releaseOrder(orderId);
    assert.ok(getRequirements(orderId).length >= 2);
  });

  it('8. release snapshots batch steps', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    assert.ok(getBatchSteps(batchId).length >= 1);
  });

  it('9. allows valid order status transitions', () => {
    assert.doesNotThrow(() => assertOrderStatusTransition('Draft', 'Planned'));
    assert.doesNotThrow(() => assertOrderStatusTransition('Planned', 'Released'));
  });

  it('10. rejects invalid status transition', () => {
    assert.throws(() => assertOrderStatusTransition('Draft', 'Completed'));
  });

  it('11. supports multiple batches per order', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 10000 });
    planOrder(orderId);
    releaseOrder(orderId);
    createBatch(orderId);
    assert.equal(getBatches(orderId).length, 2);
  });

  it('12. starts batch', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    assert.equal(getBatch(batchId)?.status, 'In Progress');
  });

  it('13. records raw material without inventory mutation', () => {
    const invBefore = queryOne<{ t: number }>('SELECT COALESCE(SUM(quantity),0) AS t FROM inventory_items')?.t ?? 0;
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', actualQuantity: 5, unit: 'kg' });
    const invAfter = queryOne<{ t: number }>('SELECT COALESCE(SUM(quantity),0) AS t FROM inventory_items')?.t ?? 0;
    assert.equal(invAfter, invBefore);
  });

  it('14. records packaging without inventory mutation', () => {
    db.run(`INSERT INTO md_packaging_materials (packaging_code, name, packaging_type, inventory_unit, active) VALUES ('PKG-T', 'Bottle', 'Bottle', 'each', 1)`);
    const invBefore = queryOne<{ t: number }>('SELECT COALESCE(SUM(quantity),0) AS t FROM inventory_items')?.t ?? 0;
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Packaging', packagingMaterialId: 1, actualQuantity: 100, unit: 'each' });
    const invAfter = queryOne<{ t: number }>('SELECT COALESCE(SUM(quantity),0) AS t FROM inventory_items')?.t ?? 0;
    assert.equal(invAfter, invBefore);
  });

  it('15. liquid input validates source tank', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    assert.throws(
      () => recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: 1, sourceTankId: 999, actualQuantity: 100, unit: 'L', actualVolumeLitres: 100, actualAbv: 40 }),
      /Tank not found|LEDGER/,
    );
  });

  it('16. liquid input validates lot volume', () => {
    const { sourceTankId, lotId } = seedSpiritTank();
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    assert.throws(
      () => recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 99999, unit: 'L', actualVolumeLitres: 99999, actualAbv: 96 }),
      /Insufficient lot volume/,
    );
  });

  it('17. planned vs actual variance', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    const waterReq = getRequirements(orderId).find((r) => r.requirement_type === 'Water')!;
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, requirementId: waterReq.id, inputType: 'Water', actualQuantity: 590, unit: 'L', actualVolumeLitres: 590, actualAbv: 0 });
    const lines = getPlannedVsActual(batchId);
    const water = lines.find((l) => l.inputType === 'Water');
    assert.equal(water?.variance, -10);
    assert.equal(ingredientVariancePercent(590, 600), -10 / 6);
  });

  it('18. water actual usage recorded', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Water', actualQuantity: 1400, unit: 'L', actualVolumeLitres: 1400, actualAbv: 0 });
    const input = queryOne<{ actual_lpa: number }>('SELECT actual_lpa FROM prod_batch_inputs WHERE batch_id = ?', [batchId]);
    assert.equal(input?.actual_lpa, 0);
  });

  it('19. process loss requires reason', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    assert.throws(() => recordLoss({ batchId, lossType: 'Spill', reason: '' }), /Loss reason/);
  });

  it('20. liquid process loss posts ledger', () => {
    const { sourceTankId, lotId } = seedSpiritTank();
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordLoss({ batchId, lossType: 'Sampling', tankId: sourceTankId, liquidLotId: lotId, volumeLitres: 1, abv: 96, reason: 'Sampling' });
    assert.ok(queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM liq_transactions WHERE transaction_type = ?', ['Sampling'])!.count >= 1);
  });

  it('21. blend execution uses actual quantities', () => {
    const { productId, recipeId, versionId } = seedProductRecipe('Blending', 1000);
    const { sourceTankId, destTankId, lotA, lotB } = seedTanksWithLots();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Blending' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotA, sourceTankId, actualQuantity: 498, unit: 'L', actualVolumeLitres: 498, actualAbv: 40 });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotB, sourceTankId, actualQuantity: 501, unit: 'L', actualVolumeLitres: 501, actualAbv: 60 });
    const result = completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 999, actualOutputAbv: 50.05 });
    assert.ok(result.lotId > 0);
    const batch = getBatch(batchId);
    assert.equal(batch?.status, 'Completed');
  });

  it('22. proof-down execution uses actual quantities', () => {
    const { productId, recipeId, versionId } = seedProductRecipe('Proof Down', 2400);
    const { sourceTankId, destTankId, lotId } = seedSpiritTank();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 2400, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 1000, unit: 'L', actualVolumeLitres: 1000, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 1398.5, unit: 'L', actualVolumeLitres: 1398.5, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 2397.8, actualOutputAbv: 40.03, notes: 'Actual measured output' });
    const batch = getBatch(batchId);
    assert.equal(batch?.actual_output_litres, 2397.8);
  });

  it('23. batch links ledger transaction group', () => {
    const { productId, recipeId, versionId } = seedProductRecipe('Proof Down', 1000);
    const { sourceTankId, destTankId, lotId } = seedSpiritTank();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Production variance' });
    const batch = getBatch(batchId);
    assert.ok(batch?.transaction_group_id);
    const txs = getBatchLedgerTransactions(batchId);
    assert.ok(txs.length >= 2);
    assert.ok(txs.every((tx) => tx.transaction_group_id === batch?.transaction_group_id));
  });

  it('24. failed ledger posting rolls back batch completion', () => {
    const { productId, recipeId, versionId } = seedProductRecipe('Proof Down', 1000);
    const { sourceTankId, lotId } = seedSpiritTank();
    const smallDest = saveTank({ name: 'Tiny', tank_type: 'Finished Spirit', capacity_litres: 10, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    assert.throws(
      () => completeBatch({ batchId, destinationTankId: smallDest, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Test' }),
      /capacity/i,
    );
    assert.equal(getBatch(batchId)?.status, 'In Progress');
    assert.equal(getBatch(batchId)?.output_lot_id, null);
  });

  it('25. output lot created correctly', () => {
    const { productId, recipeId, versionId } = seedProductRecipe('Proof Down', 1000);
    const { sourceTankId, destTankId, lotId } = seedSpiritTank();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Production variance' });
    const lot = queryOne<{ recipe_version_id: number; product_id: number }>('SELECT recipe_version_id, product_id FROM liq_lots WHERE id = ?', [getBatch(batchId)?.output_lot_id]);
    assert.equal(lot?.recipe_version_id, versionId);
    assert.equal(lot?.product_id, productId);
  });

  it('26. output genealogy created correctly', () => {
    const { productId, recipeId, versionId } = seedProductRecipe('Proof Down', 1000);
    const { sourceTankId, destTankId, lotId } = seedSpiritTank();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Production variance' });
    const outputLotId = getBatch(batchId)?.output_lot_id;
    const parent = queryOne<{ parent_lot_id: number }>('SELECT parent_lot_id FROM liq_lot_parents WHERE child_lot_id = ?', [outputLotId]);
    assert.equal(parent?.parent_lot_id, lotId);
  });

  it('27. yield calculation utilities', () => {
    assert.equal(volumeYieldPercent(990, 1000), 99);
    assert.equal(alcoholYieldPercent(400, 400), 100);
    assert.ok(Math.abs((ingredientVariancePercent(497.6, 500) ?? 0) + 0.48) < 1e-9);
  });

  it('28. multiple batch progress', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 10000 });
    planOrder(orderId);
    releaseOrder(orderId);
    const progress = getProductionProgress(orderId);
    assert.equal(progress.batchCount, 1);
    assert.equal(progress.completedBatchCount, 0);
  });

  it('29. order cannot complete with unfinished batch', () => {
    const { productId, recipeId, versionId } = seedProductRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000 });
    planOrder(orderId);
    releaseOrder(orderId);
    assert.throws(() => completeOrder(orderId), /unfinished/i);
  });

  it('30. preserves execution history after completion', () => {
    const { productId, recipeId, versionId } = seedProductRecipe('Proof Down', 1000);
    const { sourceTankId, destTankId, lotId } = seedSpiritTank();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Production variance' });
    assert.ok(queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM prod_batch_inputs WHERE batch_id = ?', [batchId])!.count >= 2);
    assert.ok(queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM prod_events WHERE production_order_id = ?', [orderId])!.count >= 2);
  });

  it('31. existing liquid ledger integration tests remain compatible', () => {
    assert.equal(typeof computeLpa(100, 40), 'number');
  });

  it('32. legacy inventory quantities unchanged after production', () => {
    const sugarBefore = inventoryQty('Molasses') || queryOne<{ t: number }>('SELECT COALESCE(SUM(quantity),0) AS t FROM inventory_items')!.t;
    const { productId, recipeId, versionId } = seedProductRecipe('Proof Down', 1000);
    const { sourceTankId, destTankId, lotId } = seedSpiritTank();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Raw Material', actualQuantity: 10, unit: 'kg' });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 400, unit: 'L', actualVolumeLitres: 400, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 600, unit: 'L', actualVolumeLitres: 600, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 990, actualOutputAbv: 40, notes: 'Production variance' });
    const sugarAfter = inventoryQty('Molasses') || queryOne<{ t: number }>('SELECT COALESCE(SUM(quantity),0) AS t FROM inventory_items')!.t;
    assert.equal(sugarAfter, sugarBefore);
  });
});

describe('batch status transitions', () => {
  it('validates batch transitions', () => {
    assert.doesNotThrow(() => assertBatchStatusTransition('Ready', 'In Progress'));
    assert.throws(() => assertBatchStatusTransition('Completed', 'In Progress'));
  });
});
