CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('liquid', 'weight', 'packaging', 'other')),
  is_canonical BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unit_conversions (
  id SERIAL PRIMARY KEY,
  from_unit_id INTEGER NOT NULL REFERENCES units(id),
  to_unit_id INTEGER NOT NULL REFERENCES units(id),
  factor NUMERIC(18, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_unit_id, to_unit_id)
);

INSERT INTO units (code, name, unit_type, is_canonical) VALUES
  ('L', 'Litres', 'liquid', TRUE),
  ('US_gal', 'US Gallons', 'liquid', FALSE),
  ('kg', 'Kilograms', 'weight', TRUE),
  ('lb', 'Pounds', 'weight', FALSE),
  ('g', 'Grams', 'weight', FALSE),
  ('each', 'Each', 'packaging', TRUE),
  ('case', 'Case', 'packaging', FALSE),
  ('pallet', 'Pallet', 'packaging', FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor)
SELECT f.id, t.id, 3.785411784
FROM units f, units t
WHERE f.code = 'US_gal' AND t.code = 'L'
ON CONFLICT DO NOTHING;

INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor)
SELECT f.id, t.id, 1 / 3.785411784
FROM units f, units t
WHERE f.code = 'L' AND t.code = 'US_gal'
ON CONFLICT DO NOTHING;

INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor)
SELECT f.id, t.id, 0.45359237
FROM units f, units t
WHERE f.code = 'lb' AND t.code = 'kg'
ON CONFLICT DO NOTHING;

INSERT INTO unit_conversions (from_unit_id, to_unit_id, factor)
SELECT f.id, t.id, 1 / 0.45359237
FROM units f, units t
WHERE f.code = 'kg' AND t.code = 'lb'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_import_runs (
  id SERIAL PRIMARY KEY,
  source_label TEXT NOT NULL DEFAULT 'browser_sqljs',
  imported_by_user_id INTEGER,
  imported_by_email TEXT,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'imported', 'failed', 'cancelled')),
  preview_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  backup_blob BYTEA,
  backup_size_bytes BIGINT,
  backup_sha256 TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
