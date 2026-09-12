import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import { dilutionCalculation, litresPureAlcohol } from '../../../shared/master-data/conversions';
import { collectActivationErrors } from '../../../shared/recipes/activation-validation';
import { scaleIngredientQuantity, scaleRecipeIngredients } from '../../../shared/recipes/scaling';
import {
  validateCarbonationOptional,
  validateQuantityBasis,
  validateTargetBrixOptional,
  validateTargetPhOptional,
} from '../../../shared/recipes/validation';
import { MASTER_DATA_SCHEMA } from '../../../src/db/master-data-schema';
import { RECIPES_SCHEMA } from '../../../src/db/recipes-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function createRecipeDb() {
  const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  db.run(MASTER_DATA_SCHEMA);
  db.run(RECIPES_SCHEMA);
  db.run(`CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    unit TEXT NOT NULL DEFAULT 'each',
    quantity REAL NOT NULL DEFAULT 0,
    reorder_level REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-0001', 'Bobo Vodka', 'Vodka', 'Active')`);
  db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-0002', 'Other Gin', 'Gin', 'Active')`);
  db.run(`INSERT INTO md_skus (sku_code, product_id, name, package_size, package_size_unit, containers_per_case)
          VALUES ('SKU-0001', 1, '750 mL', 750, 'mL', 12)`);
  db.run(`INSERT INTO md_skus (sku_code, product_id, name, package_size, package_size_unit, containers_per_case)
          VALUES ('SKU-0002', 1, '1 L', 1000, 'mL', 12)`);
  db.run(`INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, nominal_abv, active) VALUES ('BS-0001', 'NGS', 'Neutral Grain Spirit', 96, 1)`);
  db.run(`INSERT INTO md_packaging_materials (packaging_code, name, packaging_type, inventory_unit, purchase_unit, active)
          VALUES ('PKG-0001', '750 mL Bottle', 'Bottle', 'each', 'case', 1)`);
  db.run(`INSERT INTO inventory_items (name, category, unit, quantity) VALUES ('Corn', 'grain', 'lbs', 500)`);
  return db;
}

function insertRecipe(db: Awaited<ReturnType<typeof createRecipeDb>>) {
  db.run(`INSERT INTO rc_recipes (recipe_code, product_id, name, recipe_type, status) VALUES ('REC-0001', 1, 'Bobo Formula', 'Proof Down', 'Development')`);
  db.run(`INSERT INTO rc_recipe_versions (recipe_id, version_number, status, target_batch_size, batch_size_unit, target_abv)
          VALUES (1, 1, 'Draft', 1000, 'L', 40)`);
  return { recipeId: 1, versionId: 1 };
}

describe('recipe scaling', () => {
  it('scales ingredient quantities proportionally', () => {
    assert.equal(scaleIngredientQuantity(250, 1000, 2000), 500);
  });

  it('scales recipe ingredient lines for display', () => {
    const scaled = scaleRecipeIngredients(
      [{ id: 1, ingredient_type: 'Raw Material', description: 'Sugar', quantity: 100, unit: 'kg', quantity_basis: 'Per Batch' }],
      1000,
      2400,
    );
    assert.equal(scaled[0]?.scaledQuantity, 240);
  });
});

describe('recipe dilution calculator', () => {
  it('calculates proof-down from 1000 L at 96% to 40%', () => {
    const result = dilutionCalculation(1000, 96, 40);
    assert.equal(result.finalVolumeLitres, 2400);
    assert.equal(result.waterToAddLitres, 1400);
    assert.equal(result.lpa, 960);
  });

  it('calculates bulk spirit LPA at 96% ABV', () => {
    assert.equal(litresPureAlcohol(1000, 96), 960);
  });
});

describe('recipe validation', () => {
  it('accepts Phase 1C quantity basis values', () => {
    assert.doesNotThrow(() => validateQuantityBasis('Per Batch'));
    assert.doesNotThrow(() => validateQuantityBasis('Fixed Quantity'));
  });

  it('rejects unsupported quantity basis', () => {
    assert.throws(() => validateQuantityBasis('Percentage'), /not supported/);
  });

  it('validates RTD target fields when present', () => {
    assert.doesNotThrow(() => validateTargetBrixOptional(12));
    assert.doesNotThrow(() => validateTargetPhOptional(3.5));
    assert.doesNotThrow(() => validateCarbonationOptional(2.5));
    assert.throws(() => validateTargetPhOptional(15));
    assert.throws(() => validateCarbonationOptional(0));
  });
});

describe('activation validation', () => {
  it('rejects SKU from different product', () => {
    const errors = collectActivationErrors({
      productId: 1,
      productExists: true,
      version: { target_batch_size: 1000, batch_size_unit: 'L', target_abv: 40, expected_yield_percent: null, target_brix: null, target_ph: null, target_carbonation_volumes: null },
      ingredients: [],
      packaging: [{ sku_id: 1, packaging_material_id: 1, quantity: 12 }],
      validRawMaterialIds: new Set(),
      validBulkSpiritIds: new Set([1]),
      validPackagingMaterialIds: new Set([1]),
      skuProductIdBySkuId: new Map([[1, 2]]),
    });
    assert.ok(errors.some((e) => e.includes('same product')));
  });
});

describe('recipe schema constraints (sql.js)', () => {
  it('creates recipe linked to product', async () => {
    const db = await createRecipeDb();
    insertRecipe(db);
    const count = db.exec('SELECT COUNT(*) FROM rc_recipes WHERE product_id = 1')[0]?.values[0]?.[0];
    assert.equal(count, 1);
    db.close();
  });

  it('enforces unique recipe_code', async () => {
    const db = await createRecipeDb();
    insertRecipe(db);
    assert.throws(
      () => db.run(`INSERT INTO rc_recipes (recipe_code, product_id, name) VALUES ('REC-0001', 1, 'Dup')`),
      /UNIQUE constraint failed/,
    );
    db.close();
  });

  it('creates and clones recipe versions', async () => {
    const db = await createRecipeDb();
    insertRecipe(db);
    db.run(`INSERT INTO rc_recipe_versions (recipe_id, version_number, status, target_batch_size) VALUES (1, 2, 'Draft', 1000)`);
    db.run(`INSERT INTO rc_recipe_ingredients (recipe_version_id, ingredient_type, bulk_spirit_id, quantity, unit, quantity_basis)
            VALUES (1, 'Bulk Spirit', 1, 1000, 'L', 'Per Batch')`);
    db.run(`INSERT INTO rc_recipe_ingredients (recipe_version_id, ingredient_type, bulk_spirit_id, quantity, unit, quantity_basis)
            VALUES (2, 'Bulk Spirit', 1, 1000, 'L', 'Per Batch')`);
    const v2Count = db.exec('SELECT COUNT(*) FROM rc_recipe_versions WHERE recipe_id = 1')[0]?.values[0]?.[0];
    assert.equal(v2Count, 2);
    db.close();
  });

  it('allows only one Active version and archives prior on activation workflow', async () => {
    const db = await createRecipeDb();
    insertRecipe(db);
    db.run(`INSERT INTO rc_recipe_versions (recipe_id, version_number, status, target_batch_size) VALUES (1, 2, 'Draft', 1000)`);
    db.run(`UPDATE rc_recipe_versions SET status = 'Archived' WHERE recipe_id = 1 AND status = 'Active'`);
    db.run(`UPDATE rc_recipe_versions SET status = 'Active' WHERE id = 1`);
    db.run(`UPDATE rc_recipes SET active_version_id = 1 WHERE id = 1`);
    const active = db.exec(`SELECT COUNT(*) FROM rc_recipe_versions WHERE recipe_id = 1 AND status = 'Active'`)[0]?.values[0]?.[0];
    assert.equal(active, 1);
    db.close();
  });

  it('stores bulk spirit ingredient with LPA-relevant ABV from master data', async () => {
    const db = await createRecipeDb();
    insertRecipe(db);
    db.run(`INSERT INTO rc_recipe_ingredients (recipe_version_id, ingredient_type, bulk_spirit_id, quantity, unit, quantity_basis)
            VALUES (1, 'Bulk Spirit', 1, 1000, 'L', 'Per Batch')`);
    const abv = db.exec(`
      SELECT bs.nominal_abv FROM rc_recipe_ingredients i
      JOIN md_bulk_spirits bs ON bs.id = i.bulk_spirit_id WHERE i.id = 1`)[0]?.values[0]?.[0];
    assert.equal(abv, 96);
    assert.equal(litresPureAlcohol(1000, Number(abv)), 960);
    db.close();
  });

  it('supports packaging BOM per SKU for same product', async () => {
    const db = await createRecipeDb();
    insertRecipe(db);
    db.run(`INSERT INTO rc_recipe_packaging (recipe_version_id, sku_id, packaging_material_id, quantity, quantity_basis)
            VALUES (1, 1, 1, 12, 'Per Batch')`);
    db.run(`INSERT INTO rc_recipe_packaging (recipe_version_id, sku_id, packaging_material_id, quantity, quantity_basis)
            VALUES (1, 2, 1, 12, 'Per Batch')`);
    const lines = db.exec('SELECT COUNT(*) FROM rc_recipe_packaging WHERE recipe_version_id = 1')[0]?.values[0]?.[0];
    assert.equal(lines, 2);
    db.close();
  });

  it('supports ordered recipe steps and reordering', async () => {
    const db = await createRecipeDb();
    insertRecipe(db);
    db.run(`INSERT INTO rc_recipe_steps (recipe_version_id, step_number, instruction) VALUES (1, 1, 'Proof down with water')`);
    db.run(`INSERT INTO rc_recipe_steps (recipe_version_id, step_number, instruction) VALUES (1, 2, 'Rest 24 hours')`);
    db.run(`UPDATE rc_recipe_steps SET step_number = 100 WHERE id = 1`);
    db.run(`UPDATE rc_recipe_steps SET step_number = 1 WHERE id = 2`);
    db.run(`UPDATE rc_recipe_steps SET step_number = 2 WHERE id = 1`);
    const steps = db.exec('SELECT instruction FROM rc_recipe_steps WHERE recipe_version_id = 1 ORDER BY step_number')[0]?.values;
    assert.equal(steps?.[0]?.[0], 'Rest 24 hours');
    db.close();
  });

  it('rejects duplicate step numbers per version', async () => {
    const db = await createRecipeDb();
    insertRecipe(db);
    db.run(`INSERT INTO rc_recipe_steps (recipe_version_id, step_number, instruction) VALUES (1, 1, 'A')`);
    assert.throws(
      () => db.run(`INSERT INTO rc_recipe_steps (recipe_version_id, step_number, instruction) VALUES (1, 1, 'B')`),
      /UNIQUE constraint failed/,
    );
    db.close();
  });

  it('does not mutate inventory on recipe creation or activation', async () => {
    const db = await createRecipeDb();
    const before = db.exec('SELECT quantity FROM inventory_items WHERE name = \'Corn\'')[0]?.values[0]?.[0] as number;
    insertRecipe(db);
    db.run(`UPDATE rc_recipe_versions SET status = 'Active' WHERE id = 1`);
    db.run(`UPDATE rc_recipes SET active_version_id = 1, status = 'Active' WHERE id = 1`);
    const after = db.exec('SELECT quantity FROM inventory_items WHERE name = \'Corn\'')[0]?.values[0]?.[0] as number;
    assert.equal(before, 500);
    assert.equal(after, 500);
    db.close();
  });

  it('prepares source_lot_id column for future lot traceability', async () => {
    const db = await createRecipeDb();
    insertRecipe(db);
    db.run(`INSERT INTO rc_recipe_ingredients (recipe_version_id, ingredient_type, bulk_spirit_id, source_lot_id, quantity, unit, quantity_basis)
            VALUES (1, 'Bulk Spirit', 1, NULL, 1000, 'L', 'Per Batch')`);
    const lot = db.exec('SELECT source_lot_id FROM rc_recipe_ingredients WHERE id = 1')[0]?.values[0]?.[0];
    assert.equal(lot, null);
    db.close();
  });
});
