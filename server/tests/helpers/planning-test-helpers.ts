/**
 * Phase 1M Production Planning & MRP — test helpers.
 */
import { Database } from 'sql.js/dist/sql-wasm.js';
import { PRODUCTION_ORDERS_SCHEMA } from '../../../src/db/production-orders-schema';
import { seedProductionLookupsIfEmpty } from '../../../src/db/production-orders-queries';
import { createMaterialTestDb } from './material-test-db';

export async function createPlanningTestDb(): Promise<Database> {
  const db = await createMaterialTestDb(true);
  db.run(PRODUCTION_ORDERS_SCHEMA);
  seedProductionLookupsIfEmpty();
  db.run(`CREATE TABLE IF NOT EXISTS floor_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Production Floor'
  )`);
  db.run(`INSERT OR IGNORE INTO floor_plans (id, name) VALUES (1, 'Production Floor')`);
  db.run(`CREATE TABLE IF NOT EXISTS floor_equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_plan_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    equipment_type TEXT NOT NULL DEFAULT 'fermenter',
    capacity_gal REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'empty',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`INSERT INTO floor_equipment (name, equipment_type, capacity_gal) VALUES ('Line A', 'bottling_line', 0)`);
  db.run(`INSERT INTO floor_equipment (name, equipment_type, capacity_gal) VALUES ('Line B', 'bottling_line', 0)`);
  return db;
}

export function seedProductAndSku(db: Database): { productId: number; skuId: number } {
  db.run(`INSERT INTO md_products (product_code, name, category, status)
    VALUES ('PROD-T', 'Test Rum', 'Rum', 'Active')`);
  const productId = db.exec('SELECT id FROM md_products WHERE product_code = \'PROD-T\'')[0]?.values[0]?.[0] as number;
  db.run(`INSERT INTO md_skus (sku_code, product_id, name, package_type, package_size, package_size_unit, containers_per_case, status)
    VALUES ('SKU-T', ?, '750mL Bottle', 'bottle', 750, 'mL', 12, 'Active')`, [productId]);
  const skuId = db.exec('SELECT id FROM md_skus WHERE sku_code = \'SKU-T\'')[0]?.values[0]?.[0] as number;
  return { productId, skuId };
}

export function seedRecipeWithPackaging(
  db: Database,
  productId: number,
  skuId: number,
  packagingMaterialId: number,
  rawMaterialId: number,
): { recipeId: number; versionId: number } {
  db.run(`INSERT INTO rc_recipes (recipe_code, product_id, name, status)
    VALUES ('REC-T', ?, 'Test Recipe', 'Active')`, [productId]);
  const recipeId = db.exec('SELECT id FROM rc_recipes WHERE recipe_code = \'REC-T\'')[0]?.values[0]?.[0] as number;
  db.run(`INSERT INTO rc_recipe_versions (
    recipe_id, version_number, version_label, status, target_batch_size, batch_size_unit, expected_final_volume_litres
  ) VALUES (?, 1, 'v1', 'Approved', 1000, 'L', 1000)`, [recipeId]);
  const versionId = db.exec(`SELECT id FROM rc_recipe_versions WHERE recipe_id = ${recipeId}`)[0]?.values[0]?.[0] as number;
  db.run(`INSERT INTO rc_recipe_packaging (recipe_version_id, sku_id, packaging_material_id, quantity, quantity_basis)
    VALUES (?, ?, ?, 1000, 'Per Batch')`, [versionId, skuId, packagingMaterialId]);
  db.run(`INSERT INTO rc_recipe_ingredients (
    recipe_version_id, ingredient_type, raw_material_id, quantity, unit, quantity_basis
  ) VALUES (?, 'Sweetener', ?, 50, 'kg', 'Per Batch')`, [versionId, rawMaterialId]);
  return { recipeId, versionId };
}

export function seedEquipmentId(db: Database): number {
  return db.exec('SELECT id FROM floor_equipment ORDER BY id LIMIT 1')[0]?.values[0]?.[0] as number;
}
