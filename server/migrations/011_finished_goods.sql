-- Phase 1H finished goods inventory, packaging runs & COGS handoff mirror (PostgreSQL inactive until Step 1A).

CREATE TABLE IF NOT EXISTS pkg_runs (
  id BIGSERIAL PRIMARY KEY,
  run_code TEXT NOT NULL UNIQUE,
  production_order_id BIGINT REFERENCES prod_orders(id),
  production_batch_id BIGINT NOT NULL REFERENCES prod_batches(id),
  sku_id BIGINT NOT NULL REFERENCES md_skus(id),
  liquid_lot_id BIGINT NOT NULL REFERENCES liq_lots(id),
  source_tank_id BIGINT NOT NULL REFERENCES liq_tanks(id),
  destination_location_id BIGINT REFERENCES md_storage_locations(id),
  planned_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  actual_good_quantity NUMERIC(18,6),
  rejected_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  sample_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  breakage_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  package_size_ml NUMERIC(18,6),
  units_per_case INTEGER,
  packaging_bom_snapshot TEXT NOT NULL DEFAULT '',
  liquid_volume_litres NUMERIC(18,6),
  liquid_lpa NUMERIC(18,6),
  liquid_consumed_litres NUMERIC(18,6),
  liquid_loss_litres NUMERIC(18,6) NOT NULL DEFAULT 0,
  theoretical_units NUMERIC(18,6),
  packaging_yield_percent NUMERIC(18,6),
  liquid_yield_percent NUMERIC(18,6),
  status TEXT NOT NULL DEFAULT 'Draft',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  operator_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fg_lots (
  id BIGSERIAL PRIMARY KEY,
  fg_lot_code TEXT NOT NULL UNIQUE,
  printed_lot_code TEXT,
  sku_id BIGINT NOT NULL REFERENCES md_skus(id),
  production_order_id BIGINT REFERENCES prod_orders(id),
  production_batch_id BIGINT REFERENCES prod_batches(id),
  packaging_run_id BIGINT REFERENCES pkg_runs(id),
  production_date DATE NOT NULL,
  best_before_date DATE,
  expiration_date DATE,
  status TEXT NOT NULL DEFAULT 'Available',
  quality_status TEXT NOT NULL DEFAULT 'Pending',
  cost_status TEXT NOT NULL DEFAULT 'UNVALUED',
  unit_cost_kyd NUMERIC(18,6),
  total_cost_kyd NUMERIC(18,6),
  initial_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
  base_unit TEXT NOT NULL DEFAULT 'each',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fg_transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_code TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL,
  transaction_timestamp TIMESTAMPTZ NOT NULL,
  fg_lot_id BIGINT NOT NULL REFERENCES fg_lots(id),
  sku_id BIGINT NOT NULL REFERENCES md_skus(id),
  source_location_id BIGINT REFERENCES md_storage_locations(id),
  destination_location_id BIGINT REFERENCES md_storage_locations(id),
  quantity NUMERIC(18,6) NOT NULL,
  base_quantity NUMERIC(18,6) NOT NULL,
  base_unit TEXT NOT NULL DEFAULT 'each',
  transaction_group_id TEXT,
  reference_type TEXT,
  reference_id BIGINT,
  unit_cost_kyd_snapshot NUMERIC(18,6),
  extended_cost_kyd NUMERIC(18,6),
  reason_code TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversal_of_transaction_id BIGINT REFERENCES fg_transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_pkg_runs_batch ON pkg_runs(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_pkg_runs_status ON pkg_runs(status);
CREATE INDEX IF NOT EXISTS idx_fg_lots_sku ON fg_lots(sku_id);
CREATE INDEX IF NOT EXISTS idx_fg_lots_run ON fg_lots(packaging_run_id);
CREATE INDEX IF NOT EXISTS idx_fg_tx_lot ON fg_transactions(fg_lot_id);
CREATE INDEX IF NOT EXISTS idx_fg_tx_sku ON fg_transactions(sku_id);
CREATE INDEX IF NOT EXISTS idx_fg_tx_group ON fg_transactions(transaction_group_id);
