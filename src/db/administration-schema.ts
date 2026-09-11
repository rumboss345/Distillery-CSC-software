/**
 * Phase 1P Permissions, Audit Log, Documents & Administration — browser sql.js schema.
 * Append-only audit log; document metadata only (no blobs in operational tables).
 */

export const ADMINISTRATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS adm_erp_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role_code TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_adm_erp_users_role ON adm_erp_users(role_code);
CREATE INDEX IF NOT EXISTS idx_adm_erp_users_active ON adm_erp_users(active);

CREATE TABLE IF NOT EXISTS adm_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES adm_erp_users(id),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action_code TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_state TEXT,
  after_state TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_adm_audit_occurred ON adm_audit_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_adm_audit_action ON adm_audit_log(action_code);
CREATE INDEX IF NOT EXISTS idx_adm_audit_entity ON adm_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_adm_audit_actor ON adm_audit_log(actor_email);

CREATE TABLE IF NOT EXISTS adm_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes INTEGER,
  storage_uri TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_adm_docs_entity ON adm_documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_adm_docs_type ON adm_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_adm_docs_active ON adm_documents(active);
`;

export const ADMINISTRATION_V1P_MIGRATION = `
CREATE INDEX IF NOT EXISTS idx_adm_audit_occurred ON adm_audit_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_adm_docs_entity ON adm_documents(entity_type, entity_id);
`;

export const ADMINISTRATION_V1P_NEW_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];
