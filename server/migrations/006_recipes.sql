-- Phase 1C recipes & formulas (PostgreSQL mirror for future cutover; not required during browser-local testing)

CREATE TABLE IF NOT EXISTS rc_recipes (
  id SERIAL PRIMARY KEY,
  recipe_code TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES md_products(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  recipe_type TEXT NOT NULL DEFAULT 'Other',
  status TEXT NOT NULL DEFAULT 'Development',
  active_version_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rc_recipe_versions (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES rc_recipes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  version_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft',
  effective_date DATE,
  target_batch_size NUMERIC(14, 4) NOT NULL DEFAULT 1000,
  batch_size_unit TEXT NOT NULL DEFAULT 'L',
  target_abv NUMERIC(6, 3),
  expected_yield_percent NUMERIC(8, 4),
  expected_final_volume_litres NUMERIC(14, 4),
  target_brix NUMERIC(8, 4),
  target_ph NUMERIC(6, 3),
  target_carbonation_volumes NUMERIC(8, 4),
  instructions TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recipe_id, version_number)
);

CREATE TABLE IF NOT EXISTS rc_recipe_ingredients (
  id SERIAL PRIMARY KEY,
  recipe_version_id INTEGER NOT NULL REFERENCES rc_recipe_versions(id) ON DELETE CASCADE,
  ingredient_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id) ON DELETE SET NULL,
  bulk_spirit_id INTEGER REFERENCES md_bulk_spirits(id) ON DELETE SET NULL,
  source_lot_id INTEGER,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(14, 4) NOT NULL,
  unit TEXT NOT NULL,
  quantity_basis TEXT NOT NULL DEFAULT 'Per Batch',
  sequence INTEGER NOT NULL DEFAULT 0,
  optional BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rc_recipe_packaging (
  id SERIAL PRIMARY KEY,
  recipe_version_id INTEGER NOT NULL REFERENCES rc_recipe_versions(id) ON DELETE CASCADE,
  sku_id INTEGER REFERENCES md_skus(id) ON DELETE SET NULL,
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id) ON DELETE SET NULL,
  quantity NUMERIC(14, 4) NOT NULL,
  quantity_basis TEXT NOT NULL DEFAULT 'Per Batch',
  waste_allowance_percent NUMERIC(8, 4),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rc_recipe_steps (
  id SERIAL PRIMARY KEY,
  recipe_version_id INTEGER NOT NULL REFERENCES rc_recipe_versions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (recipe_version_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_rc_recipes_product ON rc_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_versions_recipe ON rc_recipe_versions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_ingredients_version ON rc_recipe_ingredients(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_packaging_version ON rc_recipe_packaging(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_packaging_sku ON rc_recipe_packaging(sku_id);
CREATE INDEX IF NOT EXISTS idx_rc_recipe_steps_version ON rc_recipe_steps(recipe_version_id);
