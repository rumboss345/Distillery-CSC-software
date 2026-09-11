/** Phase 1C recipes & formulas — browser sql.js schema. */
export const RECIPES_SCHEMA = `
CREATE TABLE IF NOT EXISTS rc_recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_code TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES md_products(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  recipe_type TEXT NOT NULL DEFAULT 'Other',
  status TEXT NOT NULL DEFAULT 'Development',
  active_version_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rc_recipe_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES rc_recipes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  version_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft',
  effective_date TEXT,
  target_batch_size REAL NOT NULL DEFAULT 1000,
  batch_size_unit TEXT NOT NULL DEFAULT 'L',
  target_abv REAL,
  expected_yield_percent REAL,
  expected_final_volume_litres REAL,
  instructions TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(recipe_id, version_number)
);

CREATE TABLE IF NOT EXISTS rc_recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_version_id INTEGER NOT NULL REFERENCES rc_recipe_versions(id) ON DELETE CASCADE,
  ingredient_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  bulk_spirit_id INTEGER REFERENCES md_bulk_spirits(id),
  description TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  quantity_basis TEXT NOT NULL DEFAULT 'Per Batch',
  sequence INTEGER NOT NULL DEFAULT 0,
  optional INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rc_recipe_packaging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_version_id INTEGER NOT NULL REFERENCES rc_recipe_versions(id) ON DELETE CASCADE,
  sku_id INTEGER REFERENCES md_skus(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  quantity REAL NOT NULL,
  quantity_basis TEXT NOT NULL DEFAULT 'Per Batch',
  waste_allowance_percent REAL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_rc_recipes_product ON rc_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_versions_recipe ON rc_recipe_versions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_ingredients_version ON rc_recipe_ingredients(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_packaging_version ON rc_recipe_packaging(recipe_version_id);
`;
