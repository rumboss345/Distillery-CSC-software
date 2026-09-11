-- Production schema: liquid volumes stored in LITRES (canonical).
-- ABV stored as percentage 0–100.

CREATE TABLE IF NOT EXISTS inventory_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  unit TEXT NOT NULL DEFAULT 'each',
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(14, 4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floor_plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Production Floor',
  width_ft NUMERIC(10, 2) NOT NULL DEFAULT 80,
  height_ft NUMERIC(10, 2) NOT NULL DEFAULT 60,
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floor_equipment (
  id SERIAL PRIMARY KEY,
  floor_plan_id INTEGER NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL DEFAULT 'fermenter',
  pos_x_ft NUMERIC(10, 2) NOT NULL DEFAULT 4,
  pos_y_ft NUMERIC(10, 2) NOT NULL DEFAULT 4,
  width_ft NUMERIC(10, 2) NOT NULL DEFAULT 8,
  depth_ft NUMERIC(10, 2) NOT NULL DEFAULT 8,
  capacity_litres NUMERIC(14, 4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'empty',
  tank_status TEXT,
  linked_mash_batch_id INTEGER,
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_floor_equipment_plan ON floor_equipment(floor_plan_id);

CREATE TABLE IF NOT EXISTS mash_batches (
  id SERIAL PRIMARY KEY,
  batch_number TEXT NOT NULL UNIQUE,
  recipe_name TEXT NOT NULL,
  grain_type TEXT NOT NULL,
  grain_lbs NUMERIC(14, 4) NOT NULL,
  water_litres NUMERIC(14, 4) NOT NULL,
  yeast_strain TEXT NOT NULL DEFAULT '',
  yeast_lbs NUMERIC(14, 4) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  target_brix NUMERIC(8, 3),
  actual_brix NUMERIC(8, 3),
  target_final_brix NUMERIC(8, 3),
  actual_final_brix NUMERIC(8, 3),
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mash_fermenter_assignments (
  id SERIAL PRIMARY KEY,
  mash_batch_id INTEGER NOT NULL REFERENCES mash_batches(id) ON DELETE CASCADE,
  floor_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
  volume_litres NUMERIC(14, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mash_batch_id, floor_equipment_id)
);

CREATE TABLE IF NOT EXISTS fermentation_logs (
  id SERIAL PRIMARY KEY,
  mash_batch_id INTEGER NOT NULL REFERENCES mash_batches(id) ON DELETE CASCADE,
  floor_equipment_id INTEGER REFERENCES floor_equipment(id),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  temperature_f NUMERIC(8, 2),
  brix NUMERIC(8, 3),
  ph NUMERIC(8, 3),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS distillation_runs (
  id SERIAL PRIMARY KEY,
  batch_number TEXT NOT NULL UNIQUE,
  run_type TEXT NOT NULL DEFAULT 'wash',
  source_mash_batch_id INTEGER REFERENCES mash_batches(id),
  source_fermenter_equipment_id INTEGER REFERENCES floor_equipment(id),
  source_holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id),
  dest_holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id),
  still_name TEXT NOT NULL DEFAULT '',
  run_date DATE NOT NULL,
  charge_volume_litres NUMERIC(14, 4) NOT NULL DEFAULT 0,
  charge_abv NUMERIC(8, 3),
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS distillation_cuts (
  id SERIAL PRIMARY KEY,
  distillation_run_id INTEGER NOT NULL REFERENCES distillation_runs(id) ON DELETE CASCADE,
  cut_type TEXT NOT NULL,
  holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  volume_litres NUMERIC(14, 4) NOT NULL DEFAULT 0,
  abv NUMERIC(8, 3) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holding_tank_transfers (
  id SERIAL PRIMARY KEY,
  spirit_type TEXT NOT NULL DEFAULT 'low_wines',
  source_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
  dest_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
  volume_litres NUMERIC(14, 4) NOT NULL DEFAULT 0,
  abv NUMERIC(8, 3) NOT NULL DEFAULT 0,
  transfer_date DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id INTEGER REFERENCES users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blend_products (
  id SERIAL PRIMARY KEY,
  batch_number TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  source_holding_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
  base_spirit_volume_litres NUMERIC(14, 4) NOT NULL DEFAULT 0,
  base_spirit_abv NUMERIC(8, 3) NOT NULL DEFAULT 0,
  blend_date DATE NOT NULL,
  target_abv NUMERIC(8, 3),
  final_volume_litres NUMERIC(14, 4) NOT NULL DEFAULT 0,
  final_abv NUMERIC(8, 3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blend_ingredients (
  id SERIAL PRIMARY KEY,
  blend_product_id INTEGER NOT NULL REFERENCES blend_products(id) ON DELETE CASCADE,
  ingredient_type TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'L',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barrels (
  id SERIAL PRIMARY KEY,
  barrel_number TEXT NOT NULL UNIQUE,
  wood_type TEXT NOT NULL DEFAULT 'American Oak',
  capacity_litres NUMERIC(14, 4) NOT NULL DEFAULT 200.626,
  fill_date DATE NOT NULL,
  spirit_type TEXT NOT NULL DEFAULT '',
  source_run_id INTEGER REFERENCES distillation_runs(id),
  initial_abv NUMERIC(8, 3) NOT NULL DEFAULT 0,
  current_volume_litres NUMERIC(14, 4) NOT NULL DEFAULT 0,
  warehouse_location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aging',
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bottling_runs (
  id SERIAL PRIMARY KEY,
  batch_number TEXT NOT NULL UNIQUE,
  source_barrel_id INTEGER REFERENCES barrels(id),
  source_run_id INTEGER REFERENCES distillation_runs(id),
  bottling_date DATE NOT NULL,
  bottle_size_ml INTEGER NOT NULL DEFAULT 750,
  bottle_count INTEGER NOT NULL DEFAULT 0,
  final_abv NUMERIC(8, 3) NOT NULL DEFAULT 0,
  product_name TEXT NOT NULL,
  lot_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_mash_fermenter_mash ON mash_fermenter_assignments(mash_batch_id);
CREATE INDEX IF NOT EXISTS idx_mash_fermenter_equipment ON mash_fermenter_assignments(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_fermentation_mash ON fermentation_logs(mash_batch_id);
CREATE INDEX IF NOT EXISTS idx_cuts_run ON distillation_cuts(distillation_run_id);
CREATE INDEX IF NOT EXISTS idx_cuts_holding_tank ON distillation_cuts(holding_tank_equipment_id);
CREATE INDEX IF NOT EXISTS idx_tank_transfers_source ON holding_tank_transfers(source_tank_equipment_id);
CREATE INDEX IF NOT EXISTS idx_tank_transfers_dest ON holding_tank_transfers(dest_tank_equipment_id);
CREATE INDEX IF NOT EXISTS idx_blend_products_tank ON blend_products(source_holding_tank_equipment_id);
CREATE INDEX IF NOT EXISTS idx_barrels_status ON barrels(status);

ALTER TABLE floor_equipment
  ADD CONSTRAINT fk_floor_equipment_mash
  FOREIGN KEY (linked_mash_batch_id) REFERENCES mash_batches(id);
