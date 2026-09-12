/**
 * Phase 1N Sales, Depletions, Shipments & COGS Recognition.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  computeFgLotBalance,
  transferFgLot,
} from '../../../src/db/finished-goods-queries';
import {
  addReturnLine,
  addShipmentLine,
  addShipmentLinesFromSuggestions,
  createReturn,
  createShipment,
  getCogsRecords,
  getDepletionAnalytics,
  getSalesOrder,
  getSalesOrderLines,
  getShipment,
  getShipmentLines,
  postReturn,
  postShipment,
  suggestLotAllocations,
} from '../../../src/db/sales-queries';
import { teardownTestDb } from '../helpers/costing-test-helpers';
import {
  createSalesDepletionTestDb,
  seedSalesScenario,
} from '../helpers/sales-depletion-test-helpers';
import { postFgReturn } from '../../../src/db/finished-goods-queries';

describe('Phase 1N Sales, Depletions & COGS', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  it('creates sales order with SO-000001 code distinct from production PO', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);
    const order = getSalesOrder(seed.orderId)!;
    assert.match(order.order_code, /^SO-\d{6}$/);
    assert.equal(order.order_code, 'SO-000001');
    assert.notEqual(order.order_code, 'PO-0001');
  });

  it('suggests FIFO lot allocation for operator review', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);
    const suggestions = suggestLotAllocations({
      skuId: seed.skuId,
      locationId: seed.fgLocId,
      quantity: 100,
      method: 'FIFO',
    });
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].fgLotId, seed.fgLotId);
    assert.equal(suggestions[0].suggestedQuantity, 100);
    assert.equal(suggestions[0].allocationMethod, 'FIFO');
  });

  it('posts shipment with immutable FG Shipment ledger entry', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);
    const shipmentId = createShipment({
      salesOrderId: seed.orderId,
      shipDate: '2026-02-05',
      shipFromLocationId: seed.fgLocId,
    });
    addShipmentLine({
      shipmentId,
      salesOrderLineId: seed.orderLineId,
      skuId: seed.skuId,
      fgLotId: seed.fgLotId,
      sourceLocationId: seed.fgLocId,
      quantity: 100,
      allocationMethod: 'Manual',
    });
    postShipment(shipmentId);

    const shipment = getShipment(shipmentId)!;
    assert.equal(shipment.status, 'Posted');
    assert.ok(shipment.posted_at);

    const fgTx = queryOne<{ transaction_type: string; reversal_of_transaction_id: number | null }>(
      `SELECT transaction_type, reversal_of_transaction_id FROM fg_transactions
       WHERE reference_type = 'sales_shipment' AND reference_id = ?`,
      [shipmentId],
    );
    assert.equal(fgTx?.transaction_type, 'Shipment');
    assert.equal(fgTx?.reversal_of_transaction_id, null);

    assert.equal(computeFgLotBalance(seed.fgLotId, seed.fgLocId), seed.onHandQty - 100);
    assert.throws(() => postShipment(shipmentId), /already been posted/i);
  });

  it('supports partial shipment and updates order status', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);

    const ship1 = createShipment({
      salesOrderId: seed.orderId,
      shipDate: '2026-02-05',
      shipFromLocationId: seed.fgLocId,
    });
    addShipmentLine({
      shipmentId: ship1,
      salesOrderLineId: seed.orderLineId,
      skuId: seed.skuId,
      fgLotId: seed.fgLotId,
      sourceLocationId: seed.fgLocId,
      quantity: 200,
    });
    postShipment(ship1);
    assert.equal(getSalesOrder(seed.orderId)!.status, 'Partially Shipped');

    const ship2 = createShipment({
      salesOrderId: seed.orderId,
      shipDate: '2026-02-10',
      shipFromLocationId: seed.fgLocId,
    });
    addShipmentLine({
      shipmentId: ship2,
      salesOrderLineId: seed.orderLineId,
      skuId: seed.skuId,
      fgLotId: seed.fgLotId,
      sourceLocationId: seed.fgLocId,
      quantity: 300,
    });
    postShipment(ship2);

    assert.equal(getSalesOrder(seed.orderId)!.status, 'Shipped');
    const line = getSalesOrderLines(seed.orderId)[0];
    assert.equal(line.shipped_quantity, 500);
  });

  it('snapshots COGS at shipment post time', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);
    const unitCostBefore = queryOne<{ unit_cost_kyd: number }>(
      'SELECT unit_cost_kyd FROM fg_lots WHERE id = ?',
      [seed.fgLotId],
    )!.unit_cost_kyd;

    const shipmentId = createShipment({
      salesOrderId: seed.orderId,
      shipDate: '2026-02-05',
      shipFromLocationId: seed.fgLocId,
    });
    addShipmentLinesFromSuggestions({
      shipmentId,
      salesOrderLineId: seed.orderLineId,
      skuId: seed.skuId,
      locationId: seed.fgLocId,
      quantity: 50,
      method: 'FIFO',
    });
    postShipment(shipmentId);

    const cogs = getCogsRecords({ shipmentId });
    assert.equal(cogs.length, 1);
    assert.equal(cogs[0].unit_cost_kyd_snapshot, unitCostBefore);
    assert.equal(cogs[0].extended_cost_kyd, unitCostBefore * 50);
    assert.equal(cogs[0].quantity, 50);

    const shipLine = getShipmentLines(shipmentId)[0];
    assert.equal(shipLine.unit_cost_kyd_snapshot, unitCostBefore);
  });

  it('return to stock restores FG balance', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);
    const shipmentId = createShipment({
      salesOrderId: seed.orderId,
      shipDate: '2026-02-05',
      shipFromLocationId: seed.fgLocId,
    });
    addShipmentLine({
      shipmentId,
      salesOrderLineId: seed.orderLineId,
      skuId: seed.skuId,
      fgLotId: seed.fgLotId,
      sourceLocationId: seed.fgLocId,
      quantity: 40,
    });
    postShipment(shipmentId);
    const shipLineId = getShipmentLines(shipmentId)[0].id;
    const balanceAfterShip = computeFgLotBalance(seed.fgLotId, seed.fgLocId);

    const returnId = createReturn({
      shipmentId,
      customerId: seed.customerId,
      returnDate: '2026-02-12',
    });
    addReturnLine({
      returnId,
      shipmentLineId: shipLineId,
      fgLotId: seed.fgLotId,
      skuId: seed.skuId,
      quantity: 10,
      disposition: 'Return to Stock',
      destinationLocationId: seed.fgLocId,
    });
    postReturn(returnId);

    assert.equal(computeFgLotBalance(seed.fgLotId, seed.fgLocId), balanceAfterShip + 10);
  });

  it('return write-off and damage do not restore net balance', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);
    const shipmentId = createShipment({
      salesOrderId: seed.orderId,
      shipDate: '2026-02-05',
      shipFromLocationId: seed.fgLocId,
    });
    addShipmentLine({
      shipmentId,
      salesOrderLineId: seed.orderLineId,
      skuId: seed.skuId,
      fgLotId: seed.fgLotId,
      sourceLocationId: seed.fgLocId,
      quantity: 20,
    });
    postShipment(shipmentId);
    const shipLineId = getShipmentLines(shipmentId)[0].id;
    const balanceAfterShip = computeFgLotBalance(seed.fgLotId, seed.fgLocId);

    const writeOffReturnId = createReturn({
      shipmentId,
      customerId: seed.customerId,
      returnDate: '2026-02-13',
    });
    addReturnLine({
      returnId: writeOffReturnId,
      shipmentLineId: shipLineId,
      fgLotId: seed.fgLotId,
      skuId: seed.skuId,
      quantity: 5,
      disposition: 'Write-Off',
      destinationLocationId: seed.fgLocId,
    });
    postReturn(writeOffReturnId);
    assert.equal(computeFgLotBalance(seed.fgLotId, seed.fgLocId), balanceAfterShip);

    const damageReturnId = createReturn({
      shipmentId,
      customerId: seed.customerId,
      returnDate: '2026-02-14',
    });
    addReturnLine({
      returnId: damageReturnId,
      shipmentLineId: shipLineId,
      fgLotId: seed.fgLotId,
      skuId: seed.skuId,
      quantity: 3,
      disposition: 'Damage',
      destinationLocationId: seed.fgLocId,
    });
    postReturn(damageReturnId);
    assert.equal(computeFgLotBalance(seed.fgLotId, seed.fgLocId), balanceAfterShip);
  });

  it('warehouse transfer does not create COGS or depletion records', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);
    db.run(
      `INSERT INTO md_storage_locations (location_code, name, location_type, active)
       VALUES ('FG-STAGING', 'FG Staging', 'Finished Goods Warehouse', 1)`,
    );
    const stagingId = queryOne<{ id: number }>(
      "SELECT id FROM md_storage_locations WHERE location_code = 'FG-STAGING'",
    )!.id;

    transferFgLot({
      fgLotId: seed.fgLotId,
      sourceLocationId: seed.fgLocId,
      destinationLocationId: stagingId,
      quantity: 75,
    });

    const cogsCount = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM sal_cogs_records')!.count;
    assert.equal(cogsCount, 0);

    const transferTx = queryOne<{ transaction_type: string }>(
      `SELECT transaction_type FROM fg_transactions WHERE transaction_type = 'Transfer Out' LIMIT 1`,
    );
    assert.equal(transferTx?.transaction_type, 'Transfer Out');
  });

  it('historical COGS unit cost remains immutable after lot cost context changes', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);
    const shipmentId = createShipment({
      salesOrderId: seed.orderId,
      shipDate: '2026-02-05',
      shipFromLocationId: seed.fgLocId,
    });
    addShipmentLine({
      shipmentId,
      salesOrderLineId: seed.orderLineId,
      skuId: seed.skuId,
      fgLotId: seed.fgLotId,
      sourceLocationId: seed.fgLocId,
      quantity: 25,
    });
    postShipment(shipmentId);
    const cogsBefore = getCogsRecords({ shipmentId })[0];

    db.run('UPDATE fg_lots SET unit_cost_kyd = unit_cost_kyd * 2 WHERE id = ?', [seed.fgLotId]);

    const cogsAfter = getCogsRecords({ shipmentId })[0];
    assert.equal(cogsAfter.unit_cost_kyd_snapshot, cogsBefore.unit_cost_kyd_snapshot);
    assert.equal(cogsAfter.extended_cost_kyd, cogsBefore.extended_cost_kyd);
  });

  it('depletion analytics aggregates by SKU, customer, channel and location', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);
    const shipmentId = createShipment({
      salesOrderId: seed.orderId,
      shipDate: '2026-02-05',
      shipFromLocationId: seed.fgLocId,
    });
    addShipmentLine({
      shipmentId,
      salesOrderLineId: seed.orderLineId,
      skuId: seed.skuId,
      fgLotId: seed.fgLotId,
      sourceLocationId: seed.fgLocId,
      quantity: 80,
    });
    postShipment(shipmentId);

    const rows = getDepletionAnalytics({
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      customerId: seed.customerId,
      channel: 'Distributor',
      locationId: seed.fgLocId,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].quantity, 80);
    assert.equal(rows[0].skuId, seed.skuId);
    assert.equal(rows[0].channel, 'Distributor');
    assert.ok(rows[0].extendedCostKyd > 0);
  });

  it('FEFO allocation prefers earliest expiration date', async () => {
    db = await createSalesDepletionTestDb();
    const seed = await seedSalesScenario(db);

    db.run(
      `UPDATE fg_lots SET expiration_date = '2026-06-01' WHERE id = ?`,
      [seed.fgLotId],
    );

    db.run(
      `INSERT INTO fg_lots (
        fg_lot_code, sku_id, production_date, expiration_date, status, quality_status,
        cost_status, unit_cost_kyd, total_cost_kyd, initial_quantity, base_unit
      ) VALUES ('FGL-TEST-002', ?, '2026-01-20', '2026-03-01', 'Available', 'Passed', 'VALUED', 5.0, 2000, 400, 'each')`,
      [seed.skuId],
    );
    const fgLot2 = queryOne<{ id: number }>(
      "SELECT id FROM fg_lots WHERE fg_lot_code = 'FGL-TEST-002'",
    )!.id;
    postFgReturn({
      fgLotId: fgLot2,
      destinationLocationId: seed.fgLocId,
      quantity: 400,
      unitCostKyd: 5.0,
      notes: 'Seed second lot for FEFO test',
    });

    const suggestions = suggestLotAllocations({
      skuId: seed.skuId,
      locationId: seed.fgLocId,
      quantity: 50,
      method: 'FEFO',
    });
    assert.equal(suggestions[0].fgLotId, fgLot2);
  });
});
