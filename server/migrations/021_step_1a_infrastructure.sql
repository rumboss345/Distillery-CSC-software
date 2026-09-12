-- Step 1A infrastructure: cutover tracking, reconciliation, dual-validation audit

INSERT INTO app_settings (key, value) VALUES
  ('database_mode', '{"mode":"browser_local","updatedAt":null}'::jsonb),
  ('schema_version', '{"version":"021","label":"step_1a_infrastructure"}'::jsonb),
  ('reconciliation_last_run', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS erp_reconciliation_runs (
  id SERIAL PRIMARY KEY,
  run_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  discrepancy_count INTEGER NOT NULL DEFAULT 0,
  performed_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_erp_reconciliation_runs_created ON erp_reconciliation_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS erp_dual_validation_log (
  id SERIAL PRIMARY KEY,
  operation_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  browser_snapshot JSONB,
  postgres_snapshot JSONB,
  match_status TEXT NOT NULL CHECK (match_status IN ('match', 'mismatch', 'skipped')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_dual_validation_created ON erp_dual_validation_log(created_at DESC);

-- Document sequence advisory lock namespace (used by server ERP layer)
COMMENT ON TABLE md_code_sequences IS 'Business document sequences; server uses pg_advisory_xact_lock for concurrent safety during Step 1A+';
