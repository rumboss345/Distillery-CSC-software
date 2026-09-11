import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';
import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';
import { resolveOutputLpa } from '../../../shared/production-orders/output-validation';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import { MASTER_DATA_SCHEMA } from '../../../src/db/master-data-schema';
import { LIQUID_LEDGER_SCHEMA } from '../../../src/db/liquid-ledger-schema';
import {
  createLot,
  getTankBalance,
  postOpeningBalance,
  postTransaction,
  saveTank,
} from '../../../src/db/liquid-ledger-queries';
import {
  cancelBatch,
  completeBatch,
  computeCalculatedRequirements,
  createOrder,
  getBatch,
  getBatchSteps,
  getEvents,
  getOrder,
  getProductionProgress,
  getRequirements,
  planOrder,
  recordInput,
  recordLoss,
  releaseOrder,
  startBatch,
  updateBatchStepStatus,
  updateDraftOrder,
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
  __injectDatabaseForTests(db);
  seedMasterDataIfEmpty();
  seedLiquidLedgerLookupsIfEmpty();
  seedProductionLookupsIfEmpty();
  return db;
}

function seedProofDownRecipe() {
  db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-0099', 'Bobo Vodka', 'Vodka', 'Active')`);
  const productId = queryOne<{ id: number }>('SELECT id FROM md_products WHERE product_code = ?', ['PROD-0099'])!.id;
  db.run(`INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, nominal_abv, active) VALUES ('BS-0099', 'NGS', 'Neutral Grain Spirit', 96, 1)`);
  const bulkSpiritId = queryOne<{ id: number }>('SELECT id FROM md_bulk_spirits WHERE spirit_code = ?', ['BS-0099'])!.id;
  const recipeId = saveRecipe({ product_id: productId, name: 'Bobo Vodka', description: '', recipe_type: 'Proof Down', status: 'Development' });
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
    source_lot_id: null,     description: 'NGS', quantity: 400, unit: 'L', quantity_basis: 'Per Batch', sequence: 1, optional: 0, notes: '',
  });
  saveRecipeIngredient(versionId, {
    ingredient_type: 'Water', raw_material_id: null, bulk_spirit_id: null,
    source_lot_id: null, description: 'Water', quantity: 600, unit: 'L', quantity_basis: 'Per Batch', sequence: 2, optional: 0, notes: '',
  });
  saveRecipeStep(versionId, { step_number: 1, instruction: 'Add botanicals', notes: '' });
  activateRecipeVersion(recipeId, versionId);
  return { productId, recipeId, versionId, bulkSpiritId };
}

function seedSpiritTank() {
  const sourceTankId = saveTank({ name: 'NGS Tank', tank_type: 'Spirit Holding', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  const destTankId = saveTank({ name: 'Finished', tank_type: 'Finished Spirit', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  postOpeningBalance({ tankId: sourceTankId, lotType: 'Purchased Bulk Spirit', description: 'NGS', volumeLitres: 5000, abv: 96, effectiveDate: '2026-01-01' });
  const lotId = queryOne<{ id: number }>('SELECT id FROM liq_lots ORDER BY id DESC LIMIT 1')!.id;
  return { sourceTankId, destTankId, lotId };
}

function seedBlendTanks() {
  const sourceTankId = saveTank({ name: 'Blend Source', tank_type: 'Spirit Holding', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  const destTankId = saveTank({ name: 'Blend Dest', tank_type: 'Finished Spirit', capacity_litres: 10000, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
  postOpeningBalance({ tankId: sourceTankId, lotType: 'Hearts', description: 'Lot A', volumeLitres: 500, abv: 40, effectiveDate: '2026-01-01' });
  const lotA = queryOne<{ id: number }>('SELECT id FROM liq_lots ORDER BY id DESC LIMIT 1')!.id;
  const lotB = createLot({
    lot_type: 'Hearts', product_id: null, bulk_spirit_id: null, recipe_version_id: null,
    description: 'Lot B', initial_volume_litres: 600, initial_abv: 60, status: 'Active',
    source_type: 'Manual', source_reference_id: null, parent_lot_id: null, notes: '',
  });
  postTransaction({
    transaction_type: 'Bulk Spirit Receipt', transaction_timestamp: new Date().toISOString(),
    source_tank_id: null, destination_tank_id: sourceTankId, source_lot_id: null, destination_lot_id: lotB,
    volume_litres: 600, abv: 60, reason_code: null, source_document_type: null, source_document_id: null,
    notes: '', created_by: null,
  });
  return { sourceTankId, destTankId, lotA, lotB };
}

function releaseProofDownOrder(plannedBatchSize = 2400) {
  const { productId, recipeId, versionId } = seedProofDownRecipe();
  const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize, productionType: 'Proof Down' });
  planOrder(orderId);
  const batchId = releaseOrder(orderId);
  return { orderId, batchId, versionId, ...seedSpiritTank() };
}

let db: Database;

describe('production integrity — requirement freeze', () => {
  beforeEach(async () => { db = await createTestDb(); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('Draft has no persisted requirements; Release freezes scaled snapshot', () => {
    const { productId, recipeId, versionId } = seedProofDownRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    assert.equal(queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM prod_order_requirements WHERE production_order_id = ?', [orderId])!.count, 0);
    const calc = computeCalculatedRequirements(versionId, 1000, orderId);
    assert.equal(calc.find((r) => r.requirement_type === 'Bulk Spirit')?.planned_quantity, 400);

    updateDraftOrder({ orderId, plannedBatchSize: 2000 });
    const calc2 = getRequirements(orderId);
    assert.equal(calc2.find((r) => r.requirement_type === 'Bulk Spirit')?.planned_quantity, 800);

    planOrder(orderId);
    releaseOrder(orderId);
    const frozen = getRequirements(orderId);
    assert.equal(frozen.find((r) => r.requirement_type === 'Bulk Spirit')?.planned_quantity, 800);
    assert.ok(frozen[0]!.id > 0);
    assert.equal(getOrder(orderId)?.snapshot_target_abv, 40);
  });

  it('released order unchanged after new active recipe version', () => {
    const { productId, recipeId, versionId } = seedProofDownRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    releaseOrder(orderId);
    const before = getRequirements(orderId);
    const newVersionId = cloneRecipeVersion(versionId);
    saveRecipeIngredient(newVersionId, {
      ingredient_type: 'Bulk Spirit', raw_material_id: null, bulk_spirit_id: queryOne<{ id: number }>('SELECT id FROM md_bulk_spirits LIMIT 1')!.id,
      source_lot_id: null, description: 'Changed', quantity: 999, unit: 'L', quantity_basis: 'Per Batch', sequence: 99, optional: 0, notes: '',
    });
    activateRecipeVersion(recipeId, newVersionId);
    const after = getRequirements(orderId);
    assert.deepEqual(after.map((r) => r.planned_quantity), before.map((r) => r.planned_quantity));
  });
});

describe('production integrity — loss posting model A', () => {
  beforeEach(async () => { db = await createTestDb(); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('pending loss does not post ledger until completion; blocks cancel after post', () => {
    const { orderId, batchId, sourceTankId, destTankId, lotId } = releaseProofDownOrder();
    startBatch(batchId);
    recordLoss({ batchId, lossType: 'Sampling', tankId: sourceTankId, liquidLotId: lotId, volumeLitres: 1, abv: 96, reason: 'Sampling' });
    const txBeforeComplete = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM liq_transactions')!.count;
    assert.equal(queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM prod_batch_losses WHERE transaction_id IS NULL')!.count, 1);

    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 1000, unit: 'L', actualVolumeLitres: 1000, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 1400, unit: 'L', actualVolumeLitres: 1400, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 2397.8, actualOutputAbv: 40.03, notes: 'Measured output' });

    assert.ok(queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM liq_transactions')!.count > txBeforeComplete);
    assert.throws(
      () => cancelBatch(batchId),
      /posted liquid transactions|Invalid production batch status/i,
    );
  });
});

describe('production integrity — completion atomicity', () => {
  beforeEach(async () => { db = await createTestDb(); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('proof-down failure rolls back; success creates full record set', () => {
    const { orderId, batchId, sourceTankId, destTankId, lotId } = releaseProofDownOrder();
    const smallDest = saveTank({ name: 'Tiny', tank_type: 'Finished Spirit', capacity_litres: 100, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 1000, unit: 'L', actualVolumeLitres: 1000, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 1400, unit: 'L', actualVolumeLitres: 1400, actualAbv: 0 });
    const spiritBefore = getTankBalance(sourceTankId).volumeLitres;
    const eventsBefore = getEvents(orderId).length;

    assert.throws(
      () => completeBatch({ batchId, destinationTankId: smallDest, actualOutputLitres: 2397.8, actualOutputAbv: 40.03, notes: 'Test' }),
      /capacity/i,
    );
    assert.equal(getBatch(batchId)?.status, 'In Progress');
    assert.equal(getBatch(batchId)?.output_lot_id, null);
    assert.equal(getTankBalance(sourceTankId).volumeLitres, spiritBefore);
    assert.equal(getEvents(orderId).length, eventsBefore);

    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 2397.8, actualOutputAbv: 40.03, notes: 'Measured output' });
    assert.equal(getBatch(batchId)?.status, 'Completed');
    assert.ok(getBatch(batchId)?.output_lot_id);
    assert.ok(getBatch(batchId)?.transaction_group_id);
  });

  it('blend failure rolls back; success consumes and creates genealogy', () => {
    const { productId, recipeId, versionId } = seedProofDownRecipe();
    db.run(`UPDATE rc_recipes SET recipe_type = 'Blending' WHERE id = ?`, [recipeId]);
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Blending' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    const { sourceTankId, destTankId, lotA, lotB } = seedBlendTanks();
    const tinyDest = saveTank({ name: 'Tiny Blend', tank_type: 'Finished Spirit', capacity_litres: 50, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });

    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotA, sourceTankId, actualQuantity: 498, unit: 'L', actualVolumeLitres: 498, actualAbv: 40 });
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotB, sourceTankId, actualQuantity: 501, unit: 'L', actualVolumeLitres: 501, actualAbv: 60 });

    assert.throws(
      () => completeBatch({ batchId, destinationTankId: tinyDest, actualOutputLitres: 999, actualOutputAbv: 50, notes: 'Blend test' }),
      /capacity/i,
    );
    assert.equal(getBatch(batchId)?.status, 'In Progress');

    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 999, actualOutputAbv: 50.05, notes: 'Blend test' });
    assert.equal(getBatch(batchId)?.status, 'Completed');
    assert.ok(queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM liq_lot_parents WHERE child_lot_id = ?', [getBatch(batchId)?.output_lot_id])!.count >= 2);
  });

  it('rejects duplicate completeBatch', () => {
    const { batchId, sourceTankId, destTankId, lotId } = releaseProofDownOrder();
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 1000, unit: 'L', actualVolumeLitres: 1000, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 1400, unit: 'L', actualVolumeLitres: 1400, actualAbv: 0 });
    completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 2397.8, actualOutputAbv: 40.03, notes: 'Measured output' });
    assert.throws(
      () => completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 100, actualOutputAbv: 40, notes: 'Dup' }),
      /already completed/i,
    );
  });

  it('revalidates lot volume at completion after concurrent consumption', () => {
    const { batchId, sourceTankId, destTankId, lotId } = releaseProofDownOrder();
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 1000, unit: 'L', actualVolumeLitres: 1000, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 1400, unit: 'L', actualVolumeLitres: 1400, actualAbv: 0 });
    postTransaction({
      transaction_type: 'Manual Adjustment Decrease', transaction_timestamp: new Date().toISOString(),
      source_tank_id: sourceTankId, destination_tank_id: null, source_lot_id: lotId, destination_lot_id: null,
      volume_litres: 4600, abv: 96, reason_code: 'Other', source_document_type: null, source_document_id: null,
      notes: 'Other op', created_by: null,
    });
    assert.throws(
      () => completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 2397.8, actualOutputAbv: 40.03, notes: 'Measured output' }),
      /insufficient|Lot/i,
    );
  });

  it('revalidates destination capacity at completion', () => {
    const { batchId, sourceTankId, lotId } = releaseProofDownOrder();
    const destTankId = saveTank({ name: 'Almost Full', tank_type: 'Finished Spirit', capacity_litres: 2500, minimum_working_volume_litres: null, location_id: null, floor_equipment_id: null, tracking_mode: 'LEDGER', status: 'Active', notes: '' });
    postOpeningBalance({ tankId: destTankId, lotType: 'Finished Spirit', description: 'Existing', volumeLitres: 500, abv: 40, effectiveDate: '2026-01-01' });
    startBatch(batchId);
    recordInput({ batchId, inputType: 'Liquid Lot', liquidLotId: lotId, sourceTankId, actualQuantity: 1000, unit: 'L', actualVolumeLitres: 1000, actualAbv: 96 });
    recordInput({ batchId, inputType: 'Water', actualQuantity: 1400, unit: 'L', actualVolumeLitres: 1400, actualAbv: 0 });
    assert.throws(
      () => completeBatch({ batchId, destinationTankId: destTankId, actualOutputLitres: 2397.8, actualOutputAbv: 40.03, notes: 'Measured output' }),
      /capacity/i,
    );
    assert.equal(getBatch(batchId)?.status, 'In Progress');
  });
});

describe('production integrity — snapshots and progress', () => {
  beforeEach(async () => { db = await createTestDb(); });
  afterEach(() => { __injectDatabaseForTests(null); });

  it('batch step instruction snapshot survives recipe edit', () => {
    const { productId, recipeId, versionId } = seedProofDownRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 1000, productionType: 'Proof Down' });
    planOrder(orderId);
    const batchId = releaseOrder(orderId);
    assert.equal(getBatchSteps(batchId)[0]?.instruction_snapshot, 'Add botanicals');

    const newVersionId = cloneRecipeVersion(versionId);
    db.run(`UPDATE rc_recipe_steps SET instruction = 'Totally different step' WHERE recipe_version_id = ?`, [newVersionId]);
    activateRecipeVersion(recipeId, newVersionId);
    assert.equal(getBatchSteps(batchId)[0]?.instruction_snapshot, 'Add botanicals');
  });

  it('progress uses completed volume not batch count', () => {
    const { productId, recipeId, versionId } = seedProofDownRecipe();
    const orderId = createOrder({ productId, recipeId, recipeVersionId: versionId, plannedBatchSize: 10000, productionType: 'Proof Down' });
    planOrder(orderId);
    releaseOrder(orderId);
    const progress = getProductionProgress(orderId);
    assert.equal(progress.percentComplete, 0);
    assert.notEqual(progress.percentComplete, 50);
  });

  it('rejects inconsistent output LPA', () => {
    assert.throws(
      () => resolveOutputLpa(1000, 40, 600),
      /inconsistent/i,
    );
  });
});
