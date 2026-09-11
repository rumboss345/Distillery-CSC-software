-- Phase 1Q QuickBooks / Accounting Integration Foundation (PostgreSQL inactive until Step 1A).
-- Browser-local staging & export handoff — no external API credentials.

CREATE TABLE IF NOT EXISTS acct_account_mappings (
  id BIGSERIAL PRIMARY KEY,
  operational_category TEXT NOT NULL UNIQUE,
  gl_account_number TEXT NOT NULL,
  gl_account_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acct_mappings_active ON acct_account_mappings(active);

CREATE TABLE IF NOT EXISTS acct_export_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_code TEXT NOT NULL UNIQUE,
  export_format TEXT NOT NULL DEFAULT 'CSV',
  adapter_type TEXT NOT NULL DEFAULT 'Manual',
  status TEXT NOT NULL DEFAULT 'Draft',
  reconciliation_status TEXT NOT NULL DEFAULT 'Pending',
  event_count INTEGER NOT NULL DEFAULT 0,
  total_debit_kyd NUMERIC(18, 4) NOT NULL DEFAULT 0,
  total_credit_kyd NUMERIC(18, 4) NOT NULL DEFAULT 0,
  exported_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acct_export_status ON acct_export_batches(status);
CREATE INDEX IF NOT EXISTS idx_acct_export_recon ON acct_export_batches(reconciliation_status);

CREATE TABLE IF NOT EXISTS acct_events (
  id BIGSERIAL PRIMARY KEY,
  event_code TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  operational_category TEXT,
  source_entity_type TEXT,
  source_entity_id BIGINT,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_date DATE NOT NULL,
  amount_kyd NUMERIC(18, 4) NOT NULL DEFAULT 0,
  debit_account_number TEXT NOT NULL,
  debit_account_name TEXT NOT NULL,
  credit_account_number TEXT NOT NULL,
  credit_account_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  export_batch_id BIGINT REFERENCES acct_export_batches(id),
  reversal_of_event_id BIGINT REFERENCES acct_events(id),
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acct_events_type ON acct_events(event_type);
CREATE INDEX IF NOT EXISTS idx_acct_events_status ON acct_events(status);
CREATE INDEX IF NOT EXISTS idx_acct_events_source ON acct_events(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_acct_events_date ON acct_events(event_date);
CREATE INDEX IF NOT EXISTS idx_acct_events_batch ON acct_events(export_batch_id);

CREATE TABLE IF NOT EXISTS acct_export_batch_lines (
  id BIGSERIAL PRIMARY KEY,
  export_batch_id BIGINT NOT NULL REFERENCES acct_export_batches(id) ON DELETE CASCADE,
  accounting_event_id BIGINT NOT NULL REFERENCES acct_events(id),
  exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(accounting_event_id)
);

CREATE INDEX IF NOT EXISTS idx_acct_export_lines_batch ON acct_export_batch_lines(export_batch_id);

COMMENT ON TABLE acct_events IS 'Immutable accounting staging records — application must not UPDATE amounts after insert.';
COMMENT ON TABLE acct_account_mappings IS 'Operational category to GL account mapping — configurable, not hard-coded.';
COMMENT ON TABLE acct_export_batches IS 'CSV/JSON export batch tracking with reconciliation status.';
