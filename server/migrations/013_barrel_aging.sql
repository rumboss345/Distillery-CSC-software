-- Phase 1J barrel aging & maturation mirror (PostgreSQL inactive until Step 1A).

CREATE TABLE IF NOT EXISTS brl_barrels (
  id BIGSERIAL PRIMARY KEY,
  barrel_code TEXT NOT NULL UNIQUE,
  cooperage TEXT NOT NULL DEFAULT '53 US gal Standard',
  wood_type TEXT NOT NULL DEFAULT 'American Oak',
  capacity_litres NUMERIC(18,6) NOT NULL DEFAULT 200.66,
  fill_count INTEGER NOT NULL DEFAULT 0,
  location_id BIGINT REFERENCES md_storage_locations(id),
  purchase_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  barcode TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Empty',
  active_fill_id BIGINT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brl_fills (
  id BIGSERIAL PRIMARY KEY,
  fill_code TEXT NOT NULL UNIQUE,
  barrel_id BIGINT NOT NULL REFERENCES brl_barrels(id),
  liquid_lot_id BIGINT NOT NULL REFERENCES liq_lots(id),
  source_tank_id BIGINT NOT NULL REFERENCES liq_tanks(id),
  fill_date DATE NOT NULL,
  fill_number INTEGER NOT NULL DEFAULT 1,
  initial_volume_litres NUMERIC(18,6) NOT NULL,
  initial_abv NUMERIC(18,6) NOT NULL,
  initial_lpa NUMERIC(18,6) NOT NULL,
  liquid_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  transaction_group_id TEXT,
  liquid_transaction_id BIGINT REFERENCES liq_transactions(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brl_observations (
  id BIGSERIAL PRIMARY KEY,
  observation_code TEXT NOT NULL UNIQUE,
  barrel_id BIGINT NOT NULL REFERENCES brl_barrels(id),
  fill_id BIGINT NOT NULL REFERENCES brl_fills(id),
  observation_date DATE NOT NULL,
  sequence_number INTEGER NOT NULL,
  volume_litres NUMERIC(18,6) NOT NULL,
  abv NUMERIC(18,6) NOT NULL,
  lpa NUMERIC(18,6) NOT NULL,
  is_fill_event BOOLEAN NOT NULL DEFAULT FALSE,
  is_dump_event BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brl_angel_share_events (
  id BIGSERIAL PRIMARY KEY,
  fill_id BIGINT NOT NULL REFERENCES brl_fills(id),
  from_observation_id BIGINT NOT NULL REFERENCES brl_observations(id),
  to_observation_id BIGINT NOT NULL REFERENCES brl_observations(id),
  volume_lost_litres NUMERIC(18,6) NOT NULL,
  lpa_lost NUMERIC(18,6) NOT NULL,
  liquid_cost_before_kyd NUMERIC(18,6) NOT NULL,
  liquid_cost_after_kyd NUMERIC(18,6) NOT NULL,
  cost_per_litre_after NUMERIC(18,6),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brl_dumps (
  id BIGSERIAL PRIMARY KEY,
  dump_code TEXT NOT NULL UNIQUE,
  fill_id BIGINT NOT NULL REFERENCES brl_fills(id),
  barrel_id BIGINT NOT NULL REFERENCES brl_barrels(id),
  destination_tank_id BIGINT NOT NULL REFERENCES liq_tanks(id),
  destination_lot_id BIGINT NOT NULL REFERENCES liq_lots(id),
  dump_date DATE NOT NULL,
  volume_litres NUMERIC(18,6) NOT NULL,
  abv NUMERIC(18,6) NOT NULL,
  lpa NUMERIC(18,6) NOT NULL,
  liquid_cost_kyd NUMERIC(18,6) NOT NULL DEFAULT 0,
  transaction_group_id TEXT,
  liquid_transaction_id BIGINT REFERENCES liq_transactions(id),
  observation_id BIGINT REFERENCES brl_observations(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brl_barrels_status ON brl_barrels(status);
CREATE INDEX IF NOT EXISTS idx_brl_barrels_location ON brl_barrels(location_id);
CREATE INDEX IF NOT EXISTS idx_brl_fills_barrel ON brl_fills(barrel_id);
CREATE INDEX IF NOT EXISTS idx_brl_fills_status ON brl_fills(status);
CREATE INDEX IF NOT EXISTS idx_brl_obs_fill ON brl_observations(fill_id);
CREATE INDEX IF NOT EXISTS idx_brl_obs_barrel ON brl_observations(barrel_id);
CREATE INDEX IF NOT EXISTS idx_brl_angel_fill ON brl_angel_share_events(fill_id);
CREATE INDEX IF NOT EXISTS idx_brl_dumps_fill ON brl_dumps(fill_id);
