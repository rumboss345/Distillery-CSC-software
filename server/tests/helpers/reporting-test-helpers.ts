import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests } from '../../../src/db/database';
import { REPORTING_SCHEMA } from '../../../src/db/reporting-schema';
import { SALES_DEPLETION_SCHEMA } from '../../../src/db/sales-schema';
import { MAINTENANCE_SCHEMA } from '../../../src/db/maintenance-schema';
import { PLANNING_SCHEMA } from '../../../src/db/planning-schema';
import { createSalesDepletionTestDb, seedSalesScenario } from './sales-depletion-test-helpers';

export async function createReportingTestDb(): Promise<Database> {
  const db = await createSalesDepletionTestDb();
  db.run(MAINTENANCE_SCHEMA);
  db.run(PLANNING_SCHEMA);
  db.run(REPORTING_SCHEMA);
  __injectDatabaseForTests(db);
  return db;
}

export { seedSalesScenario };
