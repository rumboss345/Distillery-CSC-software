import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests } from '../../../src/db/database';
import { SALES_DEPLETION_SCHEMA } from '../../../src/db/sales-schema';
import {
  FINISHED_GOODS_SCHEMA,
} from '../../../src/db/finished-goods-schema';
import {
  addSalesOrderLine,
  confirmSalesOrder,
  createCustomer,
  createSalesOrder,
} from '../../../src/db/sales-queries';
import {
  createCostingTestDb,
} from './costing-test-helpers';
import {
  runPackagingToFg,
  seedPackagingReadyBatch,
} from './finished-goods-test-helpers';

export async function createSalesDepletionTestDb(): Promise<Database> {
  const db = await createCostingTestDb(true);
  db.run(FINISHED_GOODS_SCHEMA);
  db.run(SALES_DEPLETION_SCHEMA);
  __injectDatabaseForTests(db);
  return db;
}

export type SalesSeedContext = Awaited<ReturnType<typeof seedSalesScenario>>;

export async function seedSalesScenario(db: Database) {
  __injectDatabaseForTests(db);
  const fgSeed = await seedPackagingReadyBatch(db);
  const { fgLotId } = runPackagingToFg(fgSeed);

  const customerId = createCustomer({
    name: 'Cayman Distributors Ltd',
    channel: 'Distributor',
    shipToAddress: '123 Harbour Dr, George Town',
  });

  const orderId = createSalesOrder({
    customerId,
    orderDate: '2026-02-01',
    shipFromLocationId: fgSeed.fgLocId,
  });
  const orderLineId = addSalesOrderLine({
    salesOrderId: orderId,
    skuId: fgSeed.skuId,
    orderedQuantity: 500,
  });
  confirmSalesOrder(orderId);

  return {
    ...fgSeed,
    fgLotId,
    customerId,
    orderId,
    orderLineId,
    onHandQty: 1192,
  };
}
