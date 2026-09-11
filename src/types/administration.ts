import type { ErpActionCode, ErpRoleCode } from '../../shared/admin/constants';

export interface AdmErpUser {
  id: number;
  email: string;
  display_name: string;
  role_code: ErpRoleCode;
  active: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface AdmAuditLogEntry {
  id: number;
  occurred_at: string;
  actor_user_id: number | null;
  actor_email: string;
  actor_role: ErpRoleCode;
  action_code: ErpActionCode;
  entity_type: string | null;
  entity_id: string | null;
  before_state: string | null;
  after_state: string | null;
  reason: string | null;
  created_at: string;
}

export interface AdmDocument {
  id: number;
  document_code: string;
  title: string;
  document_type: string;
  entity_type: string | null;
  entity_id: string | null;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  storage_uri: string;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string;
  active: number;
  created_at: string;
}

export interface PermissionContext {
  actorEmail?: string;
  actorRole?: ErpRoleCode;
  reason?: string | null;
}

export interface ResolvedActor {
  userId: number | null;
  email: string;
  role: ErpRoleCode;
}
