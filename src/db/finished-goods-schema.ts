/**
 * Phase 1H finished goods inventory, packaging runs & COGS handoff — browser sql.js schema.
 * Balances are transaction-derived; never authoritative quantity columns.
 */

export const FINISHED_GOODS_SCHEMA = `
CREATE TABLE IF NOT EXISTS pkg_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_code TEXT NOT NULL UNIQUE,
  production_order_id INTEGER REFERENCES prod_orders(id),
  production_batch_id INTEGER NOT NULL REFERENCES prod_batches(id),
  sku_id INTEGER NOT NULL REFERENCES md_skus(id),
  liquid_lot_id INTEGER NOT NULL REFERENCES liq_lots(id),
  source_tank_id INTEGER NOT NULL REFERENCES liq_tanks(id),
  destination_location_id INTEGER REFERENCES md_storage_locations(id),
  planned_quantity REAL NOT NULL DEFAULT 0,
  actual_good_quantity REAL,
  rejected_quantity REAL NOT NULL DEFAULT 0,
  sample_quantity REAL NOT NULL DEFAULT 0,
  breakage_quantity REAL NOT NULL DEFAULT 0,
  package_size_ml REAL,
  units_per_case INTEGER,
  packaging_bom_snapshot TEXT NOT NULL DEFAULT '',
  liquid_volume_litres REAL,
  liquid_lpa REAL,
  liquid_consumed_litres REAL,
  liquid_loss_litres REAL NOT NULL DEFAULT 0,
  theoretical_units REAL,
  packaging_yield_percent REAL,
  liquid_yield_percent REAL,
  status TEXT NOT NULL DEFAULT 'Draft',
  started_at TEXT,
  completed_at TEXT,
  operator_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fg_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fg_lot_code TEXT NOT NULL UNIQUE,
  printed_lot_code TEXT,
  sku_id INTEGER NOT NULL REFERENCES md_skus(id),
  production_order_id INTEGER REFERENCES prod_orders(id),
  production_batch_id INTEGER REFERENCES prod_batches(id),
  packaging_run_id INTEGER REFERENCES pkg_runs(id),
  production_date TEXT NOT NULL,
  best_before_date TEXT,
  expiration_date TEXT,
  status TEXT NOT NULL DEFAULT 'Available',
  quality_status TEXT NOT NULL DEFAULT 'Pending',
  cost_status TEXT NOT NULL DEFAULT 'UNVALUED',
  unit_cost_kyd REAL,
  total_cost_kyd REAL,
  initial_quantity REAL NOT NULL DEFAULT 0,
  base_unit TEXT NOT NULL DEFAULT 'each',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fg_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_code TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL,
  transaction_timestamp TEXT NOT NULL,
  fg_lot_id INTEGER NOT NULL REFERENCES fg_lots(id),
  sku_id INTEGER NOT NULL REFERENCES md_skus(id),
  source_location_id INTEGER REFERENCES md_storage_locations(id),
  destination_location_id INTEGER REFERENCES md_storage_locations(id),
  quantity REAL NOT NULL,
  base_quantity REAL NOT NULL,
  base_unit TEXT NOT NULL DEFAULT 'each',
  transaction_group_id TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  unit_cost_kyd_snapshot REAL,
  extended_cost_kyd REAL,
  reason_code TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reversal_of_transaction_id INTEGER REFERENCES fg_transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_pkg_runs_batch ON pkg_runs(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_pkg_runs_status ON pkg_runs(status);
CREATE INDEX IF NOT EXISTS idx_fg_lots_sku ON fg_lots(sku_id);
CREATE INDEX IF NOT EXISTS idx_fg_lots_run ON fg_lots(packaging_run_id);
CREATE INDEX IF NOT EXISTS idx_fg_tx_lot ON fg_transactions(fg_lot_id);
CREATE INDEX IF NOT EXISTS idx_fg_tx_sku ON fg_transactions(sku_id);
CREATE INDEX IF NOT EXISTS idx_fg_tx_group ON fg_transactions(transaction_group_id);
`;

export const FINISHED_GOODS_V1H_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_pkg_runs_batch ON pkg_runs(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_fg_lots_sku ON fg_lots(sku_id);
`;

export const FINISHED_GOODS_V1H_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
