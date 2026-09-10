export const SCHEMA = `
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  unit TEXT NOT NULL DEFAULT 'lbs',
  quantity REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mash_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number TEXT NOT NULL UNIQUE,
  recipe_name TEXT NOT NULL,
  grain_type TEXT NOT NULL,
  grain_lbs REAL NOT NULL,
  water_gal REAL NOT NULL,
  yeast_strain TEXT NOT NULL DEFAULT '',
  yeast_lbs REAL NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  target_brix REAL,
  actual_brix REAL,
  target_final_brix REAL,
  actual_final_brix REAL,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fermentation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mash_batch_id INTEGER NOT NULL REFERENCES mash_batches(id) ON DELETE CASCADE,
  floor_equipment_id INTEGER REFERENCES floor_equipment(id),
  logged_at TEXT NOT NULL DEFAULT (datetime('now')),
  temperature_f REAL,
  brix REAL,
  ph REAL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS distillation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number TEXT NOT NULL UNIQUE,
  run_type TEXT NOT NULL DEFAULT 'wash',
  source_mash_batch_id INTEGER REFERENCES mash_batches(id),
  source_fermenter_equipment_id INTEGER REFERENCES floor_equipment(id),
  source_holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id),
  dest_holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id),
  still_name TEXT NOT NULL DEFAULT '',
  run_date TEXT NOT NULL,
  charge_volume_gal REAL NOT NULL DEFAULT 0,
  charge_abv REAL,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS distillation_cuts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distillation_run_id INTEGER NOT NULL REFERENCES distillation_runs(id) ON DELETE CASCADE,
  cut_type TEXT NOT NULL,
  holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id),
  start_time TEXT NOT NULL,
  end_time TEXT,
  volume_gal REAL NOT NULL DEFAULT 0,
  abv REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS barrels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barrel_number TEXT NOT NULL UNIQUE,
  wood_type TEXT NOT NULL DEFAULT 'American Oak',
  capacity_gal REAL NOT NULL DEFAULT 53,
  fill_date TEXT NOT NULL,
  spirit_type TEXT NOT NULL DEFAULT '',
  source_run_id INTEGER REFERENCES distillation_runs(id),
  initial_abv REAL NOT NULL DEFAULT 0,
  current_volume_gal REAL NOT NULL DEFAULT 0,
  warehouse_location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aging',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bottling_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number TEXT NOT NULL UNIQUE,
  source_barrel_id INTEGER REFERENCES barrels(id),
  source_run_id INTEGER REFERENCES distillation_runs(id),
  bottling_date TEXT NOT NULL,
  bottle_size_ml INTEGER NOT NULL DEFAULT 750,
  bottle_count INTEGER NOT NULL DEFAULT 0,
  final_abv REAL NOT NULL DEFAULT 0,
  product_name TEXT NOT NULL,
  lot_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blend_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  source_holding_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
  base_spirit_volume_gal REAL NOT NULL DEFAULT 0,
  base_spirit_abv REAL NOT NULL DEFAULT 0,
  blend_date TEXT NOT NULL,
  target_abv REAL,
  final_volume_gal REAL NOT NULL DEFAULT 0,
  final_abv REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blend_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blend_product_id INTEGER NOT NULL REFERENCES blend_products(id) ON DELETE CASCADE,
  ingredient_type TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'gal',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_blend_products_tank ON blend_products(source_holding_tank_equipment_id);
CREATE INDEX IF NOT EXISTS idx_blend_ingredients_product ON blend_ingredients(blend_product_id);

CREATE INDEX IF NOT EXISTS idx_fermentation_mash ON fermentation_logs(mash_batch_id);
CREATE INDEX IF NOT EXISTS idx_fermentation_fermenter ON fermentation_logs(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_cuts_run ON distillation_cuts(distillation_run_id);
CREATE INDEX IF NOT EXISTS idx_cuts_holding_tank ON distillation_cuts(holding_tank_equipment_id);
CREATE INDEX IF NOT EXISTS idx_barrels_status ON barrels(status);

CREATE TABLE IF NOT EXISTS floor_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Production Floor',
  width_ft REAL NOT NULL DEFAULT 80,
  height_ft REAL NOT NULL DEFAULT 60,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS floor_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor_plan_id INTEGER NOT NULL DEFAULT 1 REFERENCES floor_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL DEFAULT 'fermenter',
  pos_x_ft REAL NOT NULL DEFAULT 4,
  pos_y_ft REAL NOT NULL DEFAULT 4,
  width_ft REAL NOT NULL DEFAULT 8,
  depth_ft REAL NOT NULL DEFAULT 8,
  capacity_gal REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'empty',
  linked_mash_batch_id INTEGER REFERENCES mash_batches(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_floor_equipment_plan ON floor_equipment(floor_plan_id);

CREATE TABLE IF NOT EXISTS mash_fermenter_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mash_batch_id INTEGER NOT NULL REFERENCES mash_batches(id) ON DELETE CASCADE,
  floor_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
  volume_gal REAL NOT NULL DEFAULT 0,
  UNIQUE(mash_batch_id, floor_equipment_id)
);

CREATE INDEX IF NOT EXISTS idx_mash_fermenter_mash ON mash_fermenter_assignments(mash_batch_id);
CREATE INDEX IF NOT EXISTS idx_mash_fermenter_equipment ON mash_fermenter_assignments(floor_equipment_id);
`;

export const SEED_DATA = `
INSERT OR IGNORE INTO inventory_items (id, name, category, unit, quantity, reorder_level, notes) VALUES
  (1, 'Blackstrap Molasses', 'sugar', 'lbs', 1000, 200, 'Primary fermentable for rum wash'),
  (2, 'Cane Syrup', 'sugar', 'lbs', 650, 150, 'High-test molasses / cane syrup'),
  (3, 'Raw Cane Sugar', 'sugar', 'lbs', 300, 100, 'Crystal sugar for wash'),
  (4, 'Distillers Yeast DADY', 'yeast', 'lbs', 25, 5, 'High attenuation yeast'),
  (5, 'New American Oak Barrels', 'barrels', 'each', 12, 4, '53 gallon standard'),
  (6, '750ml Bottles', 'bottles', 'each', 2000, 500, 'Standard spirit bottles'),
  (7, 'Front Labels', 'labels', 'each', 1500, 300, 'Primary product labels');

INSERT OR IGNORE INTO mash_batches (id, batch_number, recipe_name, grain_type, grain_lbs, water_gal, yeast_strain, start_date, target_brix, actual_brix, target_final_brix, actual_final_brix, status, notes) VALUES
  (1, 'M-2025-001', 'Molasses Wash', 'Blackstrap Molasses', 400, 150, 'Distillers Yeast DADY', '2025-06-01', 16.0, 15.5, 2.5, 3.0, 'complete', 'Clean fermentation, ready for still'),
  (2, 'M-2025-002', 'Cane Sugar Wash', 'Raw Cane Sugar', 750, 225, 'Distillers Yeast DADY', '2025-06-15', 17.1, 16.8, 2.0, NULL, 'fermenting', 'Day 5 of fermentation');

INSERT OR IGNORE INTO distillation_runs (id, batch_number, source_mash_batch_id, still_name, run_date, charge_volume_gal, status, notes) VALUES
  (1, 'D-2025-001', 1, 'Pot Still #1', '2025-06-10', 150, 'complete', 'First run of the season');

INSERT OR IGNORE INTO distillation_cuts (id, distillation_run_id, cut_type, holding_tank_equipment_id, start_time, end_time, volume_gal, abv, notes) VALUES
  (1, 1, 'heads', NULL, '2025-06-10T08:00', '2025-06-10T08:45', 2.1, 82, 'Discarded'),
  (2, 1, 'hearts', 5, '2025-06-10T08:45', '2025-06-10T14:30', 25.1, 68, 'Clean hearts cut'),
  (3, 1, 'tails', 6, '2025-06-10T14:30', '2025-06-10T16:00', 5.8, 25, 'Set aside for re-distillation');

INSERT OR IGNORE INTO barrels (id, barrel_number, wood_type, capacity_gal, fill_date, spirit_type, source_run_id, initial_abv, current_volume_gal, warehouse_location, status, notes) VALUES
  (1, 'B-001', 'American Oak', 53, '2025-06-11', 'New Make Spirit', 1, 63.5, 50, 'Warehouse A - Row 1', 'aging', 'Filled from D-2025-001 hearts');

INSERT OR IGNORE INTO bottling_runs (id, batch_number, source_barrel_id, bottling_date, bottle_size_ml, bottle_count, final_abv, product_name, lot_number, notes) VALUES
  (1, 'BT-2024-012', NULL, '2025-05-20', 750, 480, 43, 'Island Reserve Rum', 'L-2405', 'Previous season bottling');

INSERT OR IGNORE INTO floor_plans (id, name, width_ft, height_ft, notes) VALUES
  (1, 'Production Floor', 80, 60, 'Main distillery production area');

INSERT OR IGNORE INTO floor_equipment (id, floor_plan_id, name, equipment_type, pos_x_ft, pos_y_ft, width_ft, depth_ft, capacity_gal, status, linked_mash_batch_id, notes) VALUES
  (1, 1, 'Fermenter #1', 'fermenter', 6, 8, 10, 10, 500, 'in_use', 2, '500 gal conical fermenter'),
  (2, 1, 'Fermenter #2', 'fermenter', 20, 8, 10, 10, 500, 'in_use', 2, 'Available for next batch'),
  (3, 1, 'Mash Tun', 'mash_tun', 6, 28, 14, 12, 600, 'empty', NULL, 'Copper mash tun'),
  (4, 1, 'Pot Still #1', 'pot_still', 48, 10, 12, 14, 200, 'offline', NULL, 'Primary pot still'),
  (5, 1, 'Spirit Safe', 'holding_tank', 64, 12, 6, 4, 50, 'in_use', NULL, 'Hearts collection'),
  (6, 1, 'Low Wines Receiver', 'holding_tank', 64, 22, 8, 6, 100, 'in_use', NULL, '');

INSERT OR IGNORE INTO mash_fermenter_assignments (id, mash_batch_id, floor_equipment_id, volume_gal) VALUES
  (1, 2, 1, 112.5),
  (2, 2, 2, 112.5);

INSERT OR IGNORE INTO fermentation_logs (id, mash_batch_id, floor_equipment_id, logged_at, temperature_f, brix, ph, notes) VALUES
  (1, 2, 1, '2025-06-15T08:00:00', 72, 16.8, 4.5, 'Pitched yeast'),
  (2, 2, 1, '2025-06-16T08:00:00', 78, 14.2, 4.3, 'Active ferment'),
  (3, 2, 1, '2025-06-17T08:00:00', 80, 11.6, 4.1, ''),
  (4, 2, 2, '2025-06-15T08:00:00', 73, 16.7, 4.5, 'Pitched yeast'),
  (5, 2, 2, '2025-06-16T08:00:00', 79, 14.0, 4.2, 'Active ferment'),
  (6, 2, 2, '2025-06-17T08:00:00', 81, 11.4, 4.1, '');
`;
