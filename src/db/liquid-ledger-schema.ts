/**
 * Phase 1D liquid inventory ledger — browser sql.js schema.
 *
 * Compatibility: `floor_equipment.tracking_mode` defaults LEGACY (distillation-calculated).
 * New `liq_tanks` with tracking_mode LEDGER use transaction ledger only.
 * Legacy and ledger balances are never summed — see listLegacyFloorTanks() vs getTankBalance().
 */

export const LIQUID_LEDGER_SCHEMA = `
CREATE TABLE IF NOT EXISTS liq_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_code TEXT NOT NULL UNIQUE,
  lot_type TEXT NOT NULL,
  product_id INTEGER REFERENCES md_products(id),
  bulk_spirit_id INTEGER REFERENCES md_bulk_spirits(id),
  recipe_version_id INTEGER REFERENCES rc_recipe_versions(id),
  description TEXT NOT NULL DEFAULT '',
  initial_volume_litres REAL NOT NULL,
  initial_abv REAL NOT NULL DEFAULT 0,
  initial_lpa REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  source_type TEXT NOT NULL DEFAULT 'Manual',
  source_reference_id INTEGER,
  parent_lot_id INTEGER REFERENCES liq_lots(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS liq_lot_parents (
  child_lot_id INTEGER NOT NULL REFERENCES liq_lots(id) ON DELETE CASCADE,
  parent_lot_id INTEGER NOT NULL REFERENCES liq_lots(id) ON DELETE RESTRICT,
  contributed_volume_litres REAL NOT NULL,
  contributed_lpa REAL NOT NULL,
  transaction_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (child_lot_id, parent_lot_id)
);

CREATE TABLE IF NOT EXISTS liq_tanks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tank_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tank_type TEXT NOT NULL DEFAULT 'Spirit Holding',
  capacity_litres REAL NOT NULL DEFAULT 1000,
  minimum_working_volume_litres REAL,
  location_id INTEGER REFERENCES md_storage_locations(id),
  floor_equipment_id INTEGER REFERENCES floor_equipment(id),
  tracking_mode TEXT NOT NULL DEFAULT 'LEDGER',
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS liq_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_code TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL,
  transaction_timestamp TEXT NOT NULL,
  source_tank_id INTEGER REFERENCES liq_tanks(id),
  destination_tank_id INTEGER REFERENCES liq_tanks(id),
  source_lot_id INTEGER REFERENCES liq_lots(id),
  destination_lot_id INTEGER REFERENCES liq_lots(id),
  volume_litres REAL NOT NULL,
  abv REAL NOT NULL DEFAULT 0,
  lpa REAL NOT NULL DEFAULT 0,
  reason_code TEXT,
  source_document_type TEXT,
  source_document_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reversal_of_transaction_id INTEGER REFERENCES liq_transactions(id)
);

CREATE TABLE IF NOT EXISTS liq_reconciliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tank_id INTEGER NOT NULL REFERENCES liq_tanks(id),
  calculated_volume_litres REAL NOT NULL,
  measured_volume_litres REAL NOT NULL,
  variance_litres REAL NOT NULL,
  calculated_abv REAL NOT NULL DEFAULT 0,
  measured_abv REAL,
  adjustment_transaction_id INTEGER REFERENCES liq_transactions(id),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_liq_lots_product ON liq_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_liq_lots_bulk_spirit ON liq_lots(bulk_spirit_id);
CREATE INDEX IF NOT EXISTS idx_liq_lot_parents_child ON liq_lot_parents(child_lot_id);
CREATE INDEX IF NOT EXISTS idx_liq_lot_parents_parent ON liq_lot_parents(parent_lot_id);
CREATE INDEX IF NOT EXISTS idx_liq_tanks_floor ON liq_tanks(floor_equipment_id);
CREATE INDEX IF NOT EXISTS idx_liq_tanks_tracking ON liq_tanks(tracking_mode);
CREATE INDEX IF NOT EXISTS idx_liq_tx_source_tank ON liq_transactions(source_tank_id);
CREATE INDEX IF NOT EXISTS idx_liq_tx_dest_tank ON liq_transactions(destination_tank_id);
CREATE INDEX IF NOT EXISTS idx_liq_tx_source_lot ON liq_transactions(source_lot_id);
CREATE INDEX IF NOT EXISTS idx_liq_tx_dest_lot ON liq_transactions(destination_lot_id);
CREATE INDEX IF NOT EXISTS idx_liq_tx_timestamp ON liq_transactions(transaction_timestamp);
CREATE INDEX IF NOT EXISTS idx_liq_reconciliations_tank ON liq_reconciliations(tank_id);
`;

/** Add tracking_mode to floor_equipment for legacy compatibility. */
export const FLOOR_TRACKING_MODE_MIGRATION =
  `ALTER TABLE floor_equipment ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'LEGACY'`;
