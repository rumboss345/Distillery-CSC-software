/**
 * Phase 1Q QuickBooks / Accounting Integration Foundation — browser sql.js schema.
 * Immutable staging events, configurable account mappings, export batch tracking.
 * No external API calls; no credentials stored.
 */

export const ACCOUNTING_SCHEMA = `
CREATE TABLE IF NOT EXISTS acct_account_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operational_category TEXT NOT NULL UNIQUE COLLATE NOCASE,
  gl_account_number TEXT NOT NULL,
  gl_account_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_acct_mappings_active ON acct_account_mappings(active);

CREATE TABLE IF NOT EXISTS acct_export_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL UNIQUE,
  export_format TEXT NOT NULL DEFAULT 'CSV',
  adapter_type TEXT NOT NULL DEFAULT 'Manual',
  status TEXT NOT NULL DEFAULT 'Draft',
  reconciliation_status TEXT NOT NULL DEFAULT 'Pending',
  event_count INTEGER NOT NULL DEFAULT 0,
  total_debit_kyd REAL NOT NULL DEFAULT 0,
  total_credit_kyd REAL NOT NULL DEFAULT 0,
  exported_at TEXT,
  idempotency_key TEXT UNIQUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_acct_export_status ON acct_export_batches(status);
CREATE INDEX IF NOT EXISTS idx_acct_export_recon ON acct_export_batches(reconciliation_status);

CREATE TABLE IF NOT EXISTS acct_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_code TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  operational_category TEXT,
  source_entity_type TEXT,
  source_entity_id INTEGER,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_date TEXT NOT NULL,
  amount_kyd REAL NOT NULL DEFAULT 0,
  debit_account_number TEXT NOT NULL,
  debit_account_name TEXT NOT NULL,
  credit_account_number TEXT NOT NULL,
  credit_account_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  export_batch_id INTEGER REFERENCES acct_export_batches(id),
  reversal_of_event_id INTEGER REFERENCES acct_events(id),
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_acct_events_type ON acct_events(event_type);
CREATE INDEX IF NOT EXISTS idx_acct_events_status ON acct_events(status);
CREATE INDEX IF NOT EXISTS idx_acct_events_source ON acct_events(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_acct_events_date ON acct_events(event_date);
CREATE INDEX IF NOT EXISTS idx_acct_events_batch ON acct_events(export_batch_id);

CREATE TABLE IF NOT EXISTS acct_export_batch_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  export_batch_id INTEGER NOT NULL REFERENCES acct_export_batches(id) ON DELETE CASCADE,
  accounting_event_id INTEGER NOT NULL REFERENCES acct_events(id),
  exported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(accounting_event_id)
);

CREATE INDEX IF NOT EXISTS idx_acct_export_lines_batch ON acct_export_batch_lines(export_batch_id);
`;

export const ACCOUNTING_V1Q_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_acct_events_type ON acct_events(event_type);
CREATE INDEX IF NOT EXISTS idx_acct_events_status ON acct_events(status);
CREATE INDEX IF NOT EXISTS idx_acct_export_status ON acct_export_batches(status);
`;

export const ACCOUNTING_V1Q_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
