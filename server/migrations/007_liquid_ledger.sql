-- Phase 1D liquid inventory ledger (PostgreSQL mirror; inactive until DATABASE_URL is set)

CREATE TABLE IF NOT EXISTS liq_lots (
  id SERIAL PRIMARY KEY,
  lot_code TEXT NOT NULL UNIQUE,
  lot_type TEXT NOT NULL,
  product_id INTEGER REFERENCES md_products(id) ON DELETE SET NULL,
  bulk_spirit_id INTEGER REFERENCES md_bulk_spirits(id) ON DELETE SET NULL,
  recipe_version_id INTEGER REFERENCES rc_recipe_versions(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  initial_volume_litres NUMERIC(14, 6) NOT NULL,
  initial_abv NUMERIC(6, 3) NOT NULL DEFAULT 0,
  initial_lpa NUMERIC(14, 6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  source_type TEXT NOT NULL DEFAULT 'Manual',
  source_reference_id INTEGER,
  parent_lot_id INTEGER REFERENCES liq_lots(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS liq_lot_parents (
  child_lot_id INTEGER NOT NULL REFERENCES liq_lots(id) ON DELETE CASCADE,
  parent_lot_id INTEGER NOT NULL REFERENCES liq_lots(id) ON DELETE RESTRICT,
  contributed_volume_litres NUMERIC(14, 6) NOT NULL,
  contributed_lpa NUMERIC(14, 6) NOT NULL,
  transaction_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (child_lot_id, parent_lot_id)
);

CREATE TABLE IF NOT EXISTS liq_tanks (
  id SERIAL PRIMARY KEY,
  tank_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tank_type TEXT NOT NULL DEFAULT 'Spirit Holding',
  capacity_litres NUMERIC(14, 6) NOT NULL DEFAULT 1000,
  minimum_working_volume_litres NUMERIC(14, 6),
  location_id INTEGER REFERENCES md_storage_locations(id) ON DELETE SET NULL,
  floor_equipment_id INTEGER,
  tracking_mode TEXT NOT NULL DEFAULT 'LEDGER',
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_liq_tanks_floor_equipment_unique
  ON liq_tanks(floor_equipment_id) WHERE floor_equipment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS liq_transactions (
  id SERIAL PRIMARY KEY,
  transaction_code TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL,
  transaction_timestamp TIMESTAMPTZ NOT NULL,
  source_tank_id INTEGER REFERENCES liq_tanks(id) ON DELETE SET NULL,
  destination_tank_id INTEGER REFERENCES liq_tanks(id) ON DELETE SET NULL,
  source_lot_id INTEGER REFERENCES liq_lots(id) ON DELETE SET NULL,
  destination_lot_id INTEGER REFERENCES liq_lots(id) ON DELETE SET NULL,
  volume_litres NUMERIC(14, 6) NOT NULL,
  abv NUMERIC(6, 3) NOT NULL DEFAULT 0,
  lpa NUMERIC(14, 6) NOT NULL DEFAULT 0,
  reason_code TEXT,
  source_document_type TEXT,
  source_document_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversal_of_transaction_id INTEGER REFERENCES liq_transactions(id) ON DELETE SET NULL,
  transaction_group_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_liq_tx_group ON liq_transactions(transaction_group_id);

CREATE TABLE IF NOT EXISTS liq_reconciliations (
  id SERIAL PRIMARY KEY,
  tank_id INTEGER NOT NULL REFERENCES liq_tanks(id) ON DELETE RESTRICT,
  calculated_volume_litres NUMERIC(14, 6) NOT NULL,
  measured_volume_litres NUMERIC(14, 6) NOT NULL,
  variance_litres NUMERIC(14, 6) NOT NULL,
  calculated_abv NUMERIC(6, 3) NOT NULL DEFAULT 0,
  measured_abv NUMERIC(6, 3),
  adjustment_transaction_id INTEGER REFERENCES liq_transactions(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'LEGACY';

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
