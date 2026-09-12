-- Phase 1P Permissions, Audit Log, Documents & Administration (PostgreSQL inactive until Step 1A).

CREATE TABLE IF NOT EXISTS adm_erp_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role_code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_erp_users_role ON adm_erp_users(role_code);
CREATE INDEX IF NOT EXISTS idx_adm_erp_users_active ON adm_erp_users(active);

CREATE TABLE IF NOT EXISTS adm_audit_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_user_id BIGINT REFERENCES adm_erp_users(id),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action_code TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_audit_occurred ON adm_audit_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_adm_audit_action ON adm_audit_log(action_code);
CREATE INDEX IF NOT EXISTS idx_adm_audit_entity ON adm_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_adm_audit_actor ON adm_audit_log(actor_email);

CREATE TABLE IF NOT EXISTS adm_documents (
  id BIGSERIAL PRIMARY KEY,
  document_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  storage_uri TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adm_docs_entity ON adm_documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_adm_docs_type ON adm_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_adm_docs_active ON adm_documents(active);

COMMENT ON TABLE adm_audit_log IS 'Append-only audit trail; application must not UPDATE or DELETE rows.';
COMMENT ON TABLE adm_documents IS 'Document metadata only — file bytes stored externally via storage_uri.';
