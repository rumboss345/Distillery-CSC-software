/**
 * Phase 1J barrel aging & maturation — browser sql.js schema.
 * Liquid balances derive from immutable observations; barrel asset cost is separate from liquid cost.
 */

export const BARREL_AGING_SCHEMA = `
CREATE TABLE IF NOT EXISTS brl_barrels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barrel_code TEXT NOT NULL UNIQUE,
  cooperage TEXT NOT NULL DEFAULT '53 US gal Standard',
  wood_type TEXT NOT NULL DEFAULT 'American Oak',
  capacity_litres REAL NOT NULL DEFAULT 200.66,
  fill_count INTEGER NOT NULL DEFAULT 0,
  location_id INTEGER REFERENCES md_storage_locations(id),
  purchase_cost_kyd REAL NOT NULL DEFAULT 0,
  barcode TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Empty',
  active_fill_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brl_fills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fill_code TEXT NOT NULL UNIQUE,
  barrel_id INTEGER NOT NULL REFERENCES brl_barrels(id),
  liquid_lot_id INTEGER NOT NULL REFERENCES liq_lots(id),
  source_tank_id INTEGER NOT NULL REFERENCES liq_tanks(id),
  fill_date TEXT NOT NULL,
  fill_number INTEGER NOT NULL DEFAULT 1,
  initial_volume_litres REAL NOT NULL,
  initial_abv REAL NOT NULL,
  initial_lpa REAL NOT NULL,
  liquid_cost_kyd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  transaction_group_id TEXT,
  liquid_transaction_id INTEGER REFERENCES liq_transactions(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brl_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_code TEXT NOT NULL UNIQUE,
  barrel_id INTEGER NOT NULL REFERENCES brl_barrels(id),
  fill_id INTEGER NOT NULL REFERENCES brl_fills(id),
  observation_date TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  volume_litres REAL NOT NULL,
  abv REAL NOT NULL,
  lpa REAL NOT NULL,
  is_fill_event INTEGER NOT NULL DEFAULT 0,
  is_dump_event INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brl_angel_share_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fill_id INTEGER NOT NULL REFERENCES brl_fills(id),
  from_observation_id INTEGER NOT NULL REFERENCES brl_observations(id),
  to_observation_id INTEGER NOT NULL REFERENCES brl_observations(id),
  volume_lost_litres REAL NOT NULL,
  lpa_lost REAL NOT NULL,
  liquid_cost_before_kyd REAL NOT NULL,
  liquid_cost_after_kyd REAL NOT NULL,
  cost_per_litre_after REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brl_dumps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dump_code TEXT NOT NULL UNIQUE,
  fill_id INTEGER NOT NULL REFERENCES brl_fills(id),
  barrel_id INTEGER NOT NULL REFERENCES brl_barrels(id),
  destination_tank_id INTEGER NOT NULL REFERENCES liq_tanks(id),
  destination_lot_id INTEGER NOT NULL REFERENCES liq_lots(id),
  dump_date TEXT NOT NULL,
  volume_litres REAL NOT NULL,
  abv REAL NOT NULL,
  lpa REAL NOT NULL,
  liquid_cost_kyd REAL NOT NULL DEFAULT 0,
  transaction_group_id TEXT,
  liquid_transaction_id INTEGER REFERENCES liq_transactions(id),
  observation_id INTEGER REFERENCES brl_observations(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_brl_barrels_status ON brl_barrels(status);
CREATE INDEX IF NOT EXISTS idx_brl_barrels_location ON brl_barrels(location_id);
CREATE INDEX IF NOT EXISTS idx_brl_fills_barrel ON brl_fills(barrel_id);
CREATE INDEX IF NOT EXISTS idx_brl_fills_status ON brl_fills(status);
CREATE INDEX IF NOT EXISTS idx_brl_obs_fill ON brl_observations(fill_id);
CREATE INDEX IF NOT EXISTS idx_brl_obs_barrel ON brl_observations(barrel_id);
CREATE INDEX IF NOT EXISTS idx_brl_angel_fill ON brl_angel_share_events(fill_id);
CREATE INDEX IF NOT EXISTS idx_brl_dumps_fill ON brl_dumps(fill_id);
`;

export const BARREL_AGING_V1J_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_brl_barrels_status ON brl_barrels(status);
CREATE INDEX IF NOT EXISTS idx_brl_fills_barrel ON brl_fills(barrel_id);
CREATE INDEX IF NOT EXISTS idx_brl_obs_fill ON brl_observations(fill_id);
`;

export const BARREL_AGING_V1J_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
