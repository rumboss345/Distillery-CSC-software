/**
 * Phase 1E production orders and batch execution — browser sql.js schema.
 *
 * Production orders reference a frozen recipe_version_id. Planned requirements are
 * snapshots; actual usage is recorded separately. Liquid movements post through
 * Phase 1D ledger only — never direct tank balance overwrites.
 */

export const PRODUCTION_ORDERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS prod_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES md_products(id),
  recipe_id INTEGER NOT NULL REFERENCES rc_recipes(id),
  recipe_version_id INTEGER NOT NULL REFERENCES rc_recipe_versions(id),
  sku_id INTEGER REFERENCES md_skus(id),
  production_type TEXT NOT NULL,
  planned_batch_size REAL NOT NULL,
  batch_size_unit TEXT NOT NULL DEFAULT 'L',
  planned_output_litres REAL,
  planned_abv REAL,
  planned_quantity_units REAL,
  scheduled_date TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'Normal',
  status TEXT NOT NULL DEFAULT 'Draft',
  assigned_to TEXT,
  location_id INTEGER REFERENCES md_storage_locations(id),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  released_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  snapshot_target_abv REAL,
  snapshot_expected_yield_percent REAL,
  snapshot_target_brix REAL,
  snapshot_target_ph REAL,
  snapshot_target_carbonation_volumes REAL
);

CREATE TABLE IF NOT EXISTS prod_order_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_order_id INTEGER NOT NULL REFERENCES prod_orders(id) ON DELETE CASCADE,
  requirement_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  bulk_spirit_id INTEGER REFERENCES md_bulk_spirits(id),
  liquid_lot_id INTEGER REFERENCES liq_lots(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  sku_id INTEGER REFERENCES md_skus(id),
  description TEXT NOT NULL DEFAULT '',
  planned_quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'L',
  planned_volume_litres REAL,
  planned_abv REAL,
  planned_lpa REAL,
  sequence INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  recipe_ingredient_id INTEGER,
  recipe_packaging_id INTEGER
);

CREATE TABLE IF NOT EXISTS prod_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL UNIQUE,
  production_order_id INTEGER NOT NULL REFERENCES prod_orders(id) ON DELETE RESTRICT,
  batch_sequence INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Ready',
  started_at TEXT,
  completed_at TEXT,
  operator_id TEXT,
  source_tank_id INTEGER REFERENCES liq_tanks(id),
  destination_tank_id INTEGER REFERENCES liq_tanks(id),
  output_lot_id INTEGER REFERENCES liq_lots(id),
  actual_output_litres REAL,
  actual_output_abv REAL,
  actual_output_lpa REAL,
  actual_brix REAL,
  actual_ph REAL,
  actual_carbonation_volumes REAL,
  transaction_group_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prod_batch_inputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES prod_batches(id) ON DELETE CASCADE,
  requirement_id INTEGER REFERENCES prod_order_requirements(id),
  input_type TEXT NOT NULL,
  raw_material_id INTEGER REFERENCES md_raw_materials(id),
  bulk_spirit_id INTEGER REFERENCES md_bulk_spirits(id),
  liquid_lot_id INTEGER REFERENCES liq_lots(id),
  source_tank_id INTEGER REFERENCES liq_tanks(id),
  packaging_material_id INTEGER REFERENCES md_packaging_materials(id),
  actual_quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'L',
  actual_volume_litres REAL,
  actual_abv REAL,
  actual_lpa REAL,
  transaction_group_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prod_batch_losses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES prod_batches(id) ON DELETE CASCADE,
  loss_type TEXT NOT NULL,
  liquid_lot_id INTEGER REFERENCES liq_lots(id),
  tank_id INTEGER REFERENCES liq_tanks(id),
  volume_litres REAL,
  abv REAL,
  lpa REAL,
  quantity REAL,
  unit TEXT,
  reason TEXT NOT NULL DEFAULT '',
  transaction_id INTEGER REFERENCES liq_transactions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prod_batch_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES prod_batches(id) ON DELETE CASCADE,
  recipe_step_id INTEGER,
  step_number INTEGER NOT NULL,
  instruction_snapshot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  completed_at TEXT,
  completed_by TEXT,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS prod_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_order_id INTEGER REFERENCES prod_orders(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES prod_batches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prod_orders_status ON prod_orders(status);
CREATE INDEX IF NOT EXISTS idx_prod_orders_recipe_version ON prod_orders(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_prod_order_requirements_order ON prod_order_requirements(production_order_id);
CREATE INDEX IF NOT EXISTS idx_prod_batches_order ON prod_batches(production_order_id);
CREATE INDEX IF NOT EXISTS idx_prod_batches_status ON prod_batches(status);
CREATE INDEX IF NOT EXISTS idx_prod_batch_inputs_batch ON prod_batch_inputs(batch_id);
CREATE INDEX IF NOT EXISTS idx_prod_batch_losses_batch ON prod_batch_losses(batch_id);
CREATE INDEX IF NOT EXISTS idx_prod_batch_steps_batch ON prod_batch_steps(batch_id);
CREATE INDEX IF NOT EXISTS idx_prod_events_order ON prod_events(production_order_id);
CREATE INDEX IF NOT EXISTS idx_prod_events_batch ON prod_events(batch_id);
`;

export const PRODUCTION_ORDERS_V1E_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_prod_orders_status ON prod_orders(status);
CREATE INDEX IF NOT EXISTS idx_prod_batches_order ON prod_batches(production_order_id);
`;

export const PRODUCTION_ORDERS_V1E_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
