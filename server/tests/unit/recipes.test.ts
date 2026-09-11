import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import initSqlJs from 'sql.js/dist/sql-wasm.js';
import { dilutionCalculation, litresPureAlcohol } from '../../../shared/master-data/conversions';
import { scaleIngredientQuantity, scaleRecipeIngredients } from '../../../shared/recipes/scaling';
import { validateQuantityBasis } from '../../../shared/recipes/validation';
import { MASTER_DATA_SCHEMA } from '../../../src/db/master-data-schema';
import { RECIPES_SCHEMA } from '../../../src/db/recipes-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function createRecipeDb() {
  const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  db.run(MASTER_DATA_SCHEMA);
  db.run(RECIPES_SCHEMA);
  db.run(`INSERT INTO md_products (product_code, name, category, status) VALUES ('PROD-0001', 'Test Vodka', 'Vodka', 'Active')`);
  db.run(`INSERT INTO rc_recipes (recipe_code, product_id, name, recipe_type, status) VALUES ('REC-0001', 1, 'Test Recipe', 'Blending', 'Development')`);
  db.run(`INSERT INTO rc_recipe_versions (recipe_id, version_number, status, target_batch_size, batch_size_unit)
          VALUES (1, 1, 'Draft', 1000, 'L')`);
  return db;
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
});

describe('recipe schema constraints (sql.js)', () => {
  it('enforces unique recipe_code', async () => {
    const db = await createRecipeDb();
    assert.throws(
      () => db.run(`INSERT INTO rc_recipes (recipe_code, product_id, name) VALUES ('REC-0001', 1, 'Dup')`),
      /UNIQUE constraint failed/,
    );
    db.close();
  });

  it('enforces unique version number per recipe', async () => {
    const db = await createRecipeDb();
    assert.throws(
      () => db.run(`INSERT INTO rc_recipe_versions (recipe_id, version_number, target_batch_size) VALUES (1, 1, 500)`),
      /UNIQUE constraint failed/,
    );
    db.close();
  });

  it('allows only one active version workflow via status updates', async () => {
    const db = await createRecipeDb();
    db.run(`INSERT INTO rc_recipe_versions (recipe_id, version_number, status, target_batch_size) VALUES (1, 2, 'Draft', 1000)`);
    db.run(`UPDATE rc_recipe_versions SET status = 'Archived' WHERE recipe_id = 1 AND status = 'Active'`);
    db.run(`UPDATE rc_recipe_versions SET status = 'Active' WHERE id = 1`);
    db.run(`UPDATE rc_recipes SET active_version_id = 1, status = 'Active' WHERE id = 1`);
    const active = db.exec(`SELECT COUNT(*) FROM rc_recipe_versions WHERE recipe_id = 1 AND status = 'Active'`)[0]?.values[0]?.[0];
    assert.equal(active, 1);
    db.close();
  });

  it('stores ingredients linked to master data IDs', async () => {
    const db = await createRecipeDb();
    db.run(`INSERT INTO md_bulk_spirits (spirit_code, name, spirit_type, nominal_abv) VALUES ('BS-0001', 'NGS', 'Neutral Grain Spirit', 96)`);
    db.run(`INSERT INTO rc_recipe_ingredients (recipe_version_id, ingredient_type, bulk_spirit_id, quantity, unit, quantity_basis)
            VALUES (1, 'Bulk Spirit', 1, 1000, 'L', 'Per Batch')`);
    const count = db.exec('SELECT COUNT(*) FROM rc_recipe_ingredients')[0]?.values[0]?.[0];
    assert.equal(count, 1);
    db.close();
  });
});
