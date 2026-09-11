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
  target_brix REAL,
  target_ph REAL,
  target_carbonation_volumes REAL,
  instructions TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
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
  source_lot_id INTEGER,
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

CREATE TABLE IF NOT EXISTS rc_recipe_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_version_id INTEGER NOT NULL REFERENCES rc_recipe_versions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(recipe_version_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_rc_recipes_product ON rc_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_versions_recipe ON rc_recipe_versions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_ingredients_version ON rc_recipe_ingredients(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_packaging_version ON rc_recipe_packaging(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_packaging_sku ON rc_recipe_packaging(sku_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_steps_version ON rc_recipe_steps(recipe_version_id);
`;

/** Incremental migration for existing Phase 1C browser DBs. */
export const RECIPES_V1C_MIGRATION = `
CREATE TABLE IF NOT EXISTS rc_recipe_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_version_id INTEGER NOT NULL REFERENCES rc_recipe_versions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(recipe_version_id, step_number)
);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_packaging_sku ON rc_recipe_packaging(sku_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_steps_version ON rc_recipe_steps(recipe_version_id);
`;

export const RECIPES_V1C_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  { table: 'rc_recipe_versions', column: 'target_brix', ddl: 'ALTER TABLE rc_recipe_versions ADD COLUMN target_brix REAL' },
  { table: 'rc_recipe_versions', column: 'target_ph', ddl: 'ALTER TABLE rc_recipe_versions ADD COLUMN target_ph REAL' },
  { table: 'rc_recipe_versions', column: 'target_carbonation_volumes', ddl: 'ALTER TABLE rc_recipe_versions ADD COLUMN target_carbonation_volumes REAL' },
  { table: 'rc_recipe_versions', column: 'created_by', ddl: 'ALTER TABLE rc_recipe_versions ADD COLUMN created_by TEXT' },
  { table: 'rc_recipe_versions', column: 'approved_by', ddl: 'ALTER TABLE rc_recipe_versions ADD COLUMN approved_by TEXT' },
  { table: 'rc_recipe_versions', column: 'approved_at', ddl: 'ALTER TABLE rc_recipe_versions ADD COLUMN approved_at TEXT' },
  { table: 'rc_recipe_ingredients', column: 'source_lot_id', ddl: 'ALTER TABLE rc_recipe_ingredients ADD COLUMN source_lot_id INTEGER' },
];
