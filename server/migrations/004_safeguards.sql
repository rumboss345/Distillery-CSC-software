-- Step 1A-0 safeguards: migration state, audit tables, provenance, backup blob migration

ALTER TABLE data_import_runs ADD COLUMN IF NOT EXISTS backup_blob BYTEA;
ALTER TABLE data_import_runs ADD COLUMN IF NOT EXISTS backup_size_bytes BIGINT;
ALTER TABLE data_import_runs ADD COLUMN IF NOT EXISTS backup_sha256 TEXT;
ALTER TABLE data_import_runs DROP COLUMN IF EXISTS backup_payload;

CREATE TABLE IF NOT EXISTS auth_migration_audit (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'skipped')),
  legacy_auth_path TEXT NOT NULL DEFAULT '',
  legacy_backup_path TEXT,
  users_found INTEGER NOT NULL DEFAULT 0,
  users_imported INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS production_cutover_audit (
  id SERIAL PRIMARY KEY,
  import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL,
  performed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  performed_by_email TEXT NOT NULL,
  previous_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  validation_passed BOOLEAN NOT NULL DEFAULT FALSE,
  validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  override_used BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_replace_audit (
  id SERIAL PRIMARY KEY,
  import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL,
  performed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  performed_by_email TEXT NOT NULL,
  confirmation_phrase TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Import provenance (nullable; populated on sql.js import)
ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE floor_plans ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE floor_equipment ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE mash_batches ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE mash_fermenter_assignments ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE fermentation_logs ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE distillation_runs ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE distillation_cuts ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE holding_tank_transfers ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE blend_products ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE blend_ingredients ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE barrels ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;
ALTER TABLE bottling_runs ADD COLUMN IF NOT EXISTS import_run_id INTEGER REFERENCES data_import_runs(id) ON DELETE SET NULL;

ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'browser_sqljs';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'browser_sqljs';
ALTER TABLE mash_batches ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'browser_sqljs';
ALTER TABLE distillation_runs ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'browser_sqljs';

INSERT INTO app_settings (key, value) VALUES
  ('production_migration_state', '{"state":"MIGRATION_READY"}'::jsonb),
  ('server_api_cutover_ready', '{"ready":false,"note":"Set true when Step 1A production API writes are complete"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE data_import_runs DROP CONSTRAINT IF EXISTS data_import_runs_status_check;
ALTER TABLE data_import_runs ADD CONSTRAINT data_import_runs_status_check
  CHECK (status IN ('preview', 'importing', 'imported', 'failed', 'cancelled'));
