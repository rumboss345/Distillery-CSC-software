import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests } from '../../../src/db/database';
import { ACCOUNTING_SCHEMA } from '../../../src/db/accounting-schema';
import { SALES_DEPLETION_SCHEMA } from '../../../src/db/sales-schema';
import { FINISHED_GOODS_SCHEMA } from '../../../src/db/finished-goods-schema';
import {
  addSalesOrderLine,
  addShipmentLine,
  confirmSalesOrder,
  createCustomer,
  createSalesOrder,
  createShipment,
  postShipment,
} from '../../../src/db/sales-queries';
import { createCostingTestDb } from './costing-test-helpers';
import { seedSalesScenario } from './sales-depletion-test-helpers';
import type { seedTraceableProductionChain } from './quality-test-helpers';

export async function createAccountingIntegrationTestDb(): Promise<Database> {
  const db = await createCostingTestDb(true);
  db.run(FINISHED_GOODS_SCHEMA);
  db.run(SALES_DEPLETION_SCHEMA);
  db.run(ACCOUNTING_SCHEMA);
  __injectDatabaseForTests(db);
  return db;
}

export async function seedAccountingShipmentScenario(db: Database) {
  __injectDatabaseForTests(db);
  const sales = await seedSalesScenario(db);
  const shipmentId = createShipment({
    salesOrderId: sales.orderId,
    shipDate: '2026-02-10',
    shipFromLocationId: sales.fgLocId,
  });
  addShipmentLine({
    shipmentId,
    salesOrderLineId: sales.orderLineId,
    skuId: sales.skuId,
    fgLotId: sales.fgLotId,
    sourceLocationId: sales.fgLocId,
    quantity: 100,
  });
  postShipment(shipmentId);
  return { ...sales, shipmentId };
}

type TraceChain = Awaited<ReturnType<typeof seedTraceableProductionChain>>;

/** Post a sales shipment against an existing traceable production chain (no duplicate product seed). */
export function postShipmentForTraceChain(
  chain: TraceChain,
  opts: { quantity?: number; shipDate?: string } = {},
) {
  const quantity = opts.quantity ?? 100;
  const customerId = createCustomer({
    name: 'Traceability Test Customer',
    channel: 'Distributor',
    shipToAddress: '1 Test Lane',
  });
  const orderId = createSalesOrder({
    customerId,
    orderDate: '2026-02-01',
    shipFromLocationId: chain.fgLocId,
  });
  const orderLineId = addSalesOrderLine({
    salesOrderId: orderId,
    skuId: chain.skuId,
    orderedQuantity: 500,
  });
  confirmSalesOrder(orderId);

  const shipmentId = createShipment({
    salesOrderId: orderId,
    shipDate: opts.shipDate ?? '2026-02-10',
    shipFromLocationId: chain.fgLocId,
  });
  addShipmentLine({
    shipmentId,
    salesOrderLineId: orderLineId,
    skuId: chain.skuId,
    fgLotId: chain.fgLotId,
    sourceLocationId: chain.fgLocId,
    quantity,
  });
  postShipment(shipmentId);

  return { customerId, orderId, orderLineId, shipmentId, quantity };
}
