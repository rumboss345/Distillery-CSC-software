import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests } from '../../../src/db/database';
import { MASTER_DATA_SCHEMA } from '../../../src/db/master-data-schema';
import { RECIPES_SCHEMA } from '../../../src/db/recipes-schema';
import { LIQUID_LEDGER_SCHEMA } from '../../../src/db/liquid-ledger-schema';
import { PRODUCTION_ORDERS_SCHEMA } from '../../../src/db/production-orders-schema';
import { MATERIAL_INVENTORY_SCHEMA, MATERIAL_INVENTORY_V1F_NEW_COLUMNS } from '../../../src/db/material-inventory-schema';
import { COSTING_SCHEMA } from '../../../src/db/costing-schema';
import { FINISHED_GOODS_SCHEMA } from '../../../src/db/finished-goods-schema';
import { BARREL_AGING_SCHEMA } from '../../../src/db/barrel-aging-schema';
import { QUALITY_SCHEMA } from '../../../src/db/quality-schema';
import { seedMasterDataIfEmpty } from '../../../src/db/master-data-queries';
import { seedLiquidLedgerLookupsIfEmpty } from '../../../src/db/liquid-ledger-queries';
import { seedProductionLookupsIfEmpty } from '../../../src/db/production-orders-queries';
import { seedMaterialLookupsIfEmpty } from '../../../src/db/material-inventory-queries';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function mockStorage(): void {
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

export async function createMaterialTestDb(includeProduction = false): Promise<Database> {
  mockStorage();
  const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  db.run(MASTER_DATA_SCHEMA);
  db.run(RECIPES_SCHEMA);
  db.run(LIQUID_LEDGER_SCHEMA);
  if (includeProduction) db.run(PRODUCTION_ORDERS_SCHEMA);
  db.run(MATERIAL_INVENTORY_SCHEMA);
  db.run(COSTING_SCHEMA);
  db.run(FINISHED_GOODS_SCHEMA);
  db.run(BARREL_AGING_SCHEMA);
  db.run(QUALITY_SCHEMA);
  for (const col of MATERIAL_INVENTORY_V1F_NEW_COLUMNS) {
    try { db.run(col.ddl); } catch { /* column may exist */ }
  }
  db.run(`CREATE TABLE IF NOT EXISTS inventory_items (id INTEGER PRIMARY KEY, name TEXT, quantity REAL DEFAULT 0, unit TEXT DEFAULT 'each')`);
  db.run(`INSERT INTO inventory_items (name, quantity) VALUES ('Legacy Sugar', 500)`);
  __injectDatabaseForTests(db);
  seedMasterDataIfEmpty();
  seedLiquidLedgerLookupsIfEmpty();
  if (includeProduction) seedProductionLookupsIfEmpty();
  seedMaterialLookupsIfEmpty();
  return db;
}

export function seedSupplierAndLocation(db: Database) {
  db.run(`INSERT INTO md_suppliers (supplier_code, company_name, supplier_type, active) VALUES ('SUP-T', 'Test Supplier', 'Raw Materials', 1)`);
  db.run(`INSERT INTO md_storage_locations (location_code, name, location_type, active) VALUES ('LOC-A', 'Main Warehouse', 'Raw Material Warehouse', 1)`);
  db.run(`INSERT INTO md_storage_locations (location_code, name, location_type, active) VALUES ('LOC-B', 'Staging', 'Production Floor', 1)`);
  const supplierId = db.exec(`SELECT id FROM md_suppliers WHERE supplier_code = 'SUP-T'`)[0]?.values[0]?.[0] as number;
  const locA = db.exec(`SELECT id FROM md_storage_locations WHERE location_code = 'LOC-A'`)[0]?.values[0]?.[0] as number;
  const locB = db.exec(`SELECT id FROM md_storage_locations WHERE location_code = 'LOC-B'`)[0]?.values[0]?.[0] as number;
  return { supplierId, locA, locB };
}

export function seedPackagingMaterial(db: Database) {
  db.run(`INSERT INTO md_packaging_materials (packaging_code, name, packaging_type, inventory_unit, purchase_unit, units_per_purchase_unit, active, inventory_tracking_mode)
    VALUES ('PKG-BTL', '750mL Bottle', 'Bottle', 'each', 'case', 12, 1, 'LEGACY')`);
  return db.exec(`SELECT id FROM md_packaging_materials WHERE packaging_code = 'PKG-BTL'`)[0]?.values[0]?.[0] as number;
}

export function seedRawMaterial(db: Database) {
  db.run(`INSERT INTO md_raw_materials (material_code, name, material_type, inventory_unit, purchase_unit, conversion_factor, active, inventory_tracking_mode)
    VALUES ('RM-SUG', 'Sugar', 'Sweetener', 'kg', 'bag', 50, 1, 'LEGACY')`);
  return db.exec(`SELECT id FROM md_raw_materials WHERE material_code = 'RM-SUG'`)[0]?.values[0]?.[0] as number;
}
