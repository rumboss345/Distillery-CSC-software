/**
 * Phase 1H finished goods inventory & packaging runs.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  completePackagingRun,
  computeFgLotBalance,
  computeSkuBalance,
  createPackagingRun,
  getFgLot,
  listFgInventory,
  postFgDamage,
  postFgWriteOff,
  reverseFgTransaction,
  startPackagingRun,
  transferFgLot,
} from '../../../src/db/finished-goods-queries';
import {
  createCostingTestDb,
  seedProofDownScenario,
  teardownTestDb,
} from '../helpers/costing-test-helpers';
import {
  runPackagingToFg,
  seedPackagingReadyBatch,
} from '../helpers/finished-goods-test-helpers';

describe('Phase 1H finished goods', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  it('production receipt creates FG lot with cost handoff', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    const { fgLotId } = runPackagingToFg(seed);
    const lot = getFgLot(fgLotId)!;
    assert.ok(lot.unit_cost_kyd != null && lot.unit_cost_kyd > 0);
    assert.ok(lot.total_cost_kyd != null && lot.total_cost_kyd > 0);
    assert.equal(lot.printed_lot_code, 'PRINT-2026-001');
  });

  it('FG balance derived from transactions not stored quantity', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    const { fgLotId } = runPackagingToFg(seed);
    const onHand = computeFgLotBalance(fgLotId);
    assert.equal(onHand, 1192);
  });

  it('SKU balance aggregates lot positions', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    runPackagingToFg(seed);
    assert.equal(computeSkuBalance(seed.skuId), 1192);
  });

  it('transfer moves quantity between locations', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    const { fgLotId } = runPackagingToFg(seed);
    db.run(
      `INSERT INTO md_storage_locations (location_code, name, location_type, active)
       VALUES ('FG-B', 'FG Staging', 'Finished Goods Warehouse', 1)`,
    );
    const locB = queryOne<{ id: number }>("SELECT id FROM md_storage_locations WHERE location_code = 'FG-B'")!.id;
    transferFgLot({
      fgLotId,
      sourceLocationId: seed.fgLocId,
      destinationLocationId: locB,
      quantity: 200,
    });
    assert.equal(computeFgLotBalance(fgLotId, seed.fgLocId), 992);
    assert.equal(computeFgLotBalance(fgLotId, locB), 200);
  });

  it('duplicate packaging run completion blocked', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    const { runId } = runPackagingToFg(seed);
    assert.throws(
      () =>
        completePackagingRun({
          runId,
          actualGoodQuantity: 100,
          liquidConsumedLitres: 50,
        }),
      /already completed/i,
    );
  });

  it('incomplete batch blocks packaging run', async () => {
    db = await createCostingTestDb(true);
    const scenario = seedProofDownScenario(db);
    db.run(
      `INSERT INTO md_skus (sku_code, product_id, name, package_type, package_size, package_size_unit, containers_per_case, status)
       VALUES ('SKU-X', ?, 'Test SKU', 'bottle', 750, 'mL', 12, 'Active')`,
      [scenario.productId],
    );
    const skuId = queryOne<{ id: number }>('SELECT id FROM md_skus WHERE sku_code = ?', ['SKU-X'])!.id;
    db.run(
      `INSERT INTO md_storage_locations (location_code, name, location_type, active)
       VALUES ('FG-X', 'FG', 'Finished Goods Warehouse', 1)`,
    );
    const locId = queryOne<{ id: number }>("SELECT id FROM md_storage_locations WHERE location_code = 'FG-X'")!.id;
    db.run(
      `INSERT INTO prod_batches (batch_code, production_order_id, status) VALUES ('PB-OPEN', 1, 'In Progress')`,
    );
    assert.throws(
      () =>
        createPackagingRun({
          productionBatchId: 1,
          skuId,
          liquidLotId: scenario.lotId,
          sourceTankId: scenario.sourceTankId,
          destinationLocationId: locId,
          plannedQuantity: 100,
        }),
      /completed production batch/i,
    );
  });

  it('historical unit cost immutable on lot after completion', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    const { fgLotId } = runPackagingToFg(seed);
    const before = getFgLot(fgLotId)!.unit_cost_kyd;
    postFgDamage({ fgLotId, locationId: seed.fgLocId, quantity: 1, reason: 'Test damage' });
    assert.equal(getFgLot(fgLotId)!.unit_cost_kyd, before);
  });

  it('damage and write-off post ledger transactions', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    const { fgLotId } = runPackagingToFg(seed);
    postFgDamage({ fgLotId, locationId: seed.fgLocId, quantity: 2, reason: 'Damaged label' });
    postFgWriteOff({ fgLotId, locationId: seed.fgLocId, quantity: 1, reason: 'Expired' });
    assert.equal(computeFgLotBalance(fgLotId), 1189);
  });

  it('duplicate reversal blocked', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    const { fgLotId } = runPackagingToFg(seed);
    const txId = queryOne<{ id: number }>(
      "SELECT id FROM fg_transactions WHERE transaction_type = 'Production Receipt' AND fg_lot_id = ?",
      [fgLotId],
    )!.id;
    reverseFgTransaction(txId);
    assert.throws(() => reverseFgTransaction(txId), /already been reversed/i);
  });

  it('list inventory exposes valued rows', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    runPackagingToFg(seed);
    const rows = listFgInventory();
    assert.ok(rows.length >= 1);
    assert.ok(rows[0]!.extended_cost_kyd != null);
  });

  it('legacy tank isolation — packaging requires LEDGER tank', async () => {
    db = await createCostingTestDb(true);
    const seed = await seedPackagingReadyBatch(db);
    db.run(`UPDATE liq_tanks SET tracking_mode = 'LEGACY' WHERE id = ?`, [seed.destTankId]);
    assert.throws(
      () =>
        createPackagingRun({
          productionBatchId: seed.batchId,
          skuId: seed.skuId,
          liquidLotId: seed.outputLotId,
          sourceTankId: seed.destTankId,
          destinationLocationId: seed.fgLocId,
          plannedQuantity: 100,
        }),
      /LEDGER-managed/i,
    );
  });
});
