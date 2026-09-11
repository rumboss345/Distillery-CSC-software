import type { ErpActionCode } from '../../../../shared/admin/constants.js';
import { queryAll } from '../pg-helpers.js';

export async function listErpUsers(includeInactive = false) {
  if (includeInactive) {
    return queryAll('SELECT * FROM adm_erp_users ORDER BY email');
  }
  return queryAll('SELECT id, email, display_name, role_code, active, created_at FROM adm_erp_users WHERE active = TRUE ORDER BY email');
}

export async function listAuditLog(filters?: {
  actionCode?: ErpActionCode;
  entityType?: string;
  entityId?: string;
  actorEmail?: string;
  limit?: number;
}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.actionCode) {
    clauses.push(`action_code = $${idx++}`);
    params.push(filters.actionCode);
  }
  if (filters?.entityType) {
    clauses.push(`entity_type = $${idx++}`);
    params.push(filters.entityType);
  }
  if (filters?.entityId) {
    clauses.push(`entity_id = $${idx++}`);
    params.push(filters.entityId);
  }
  if (filters?.actorEmail) {
    clauses.push(`lower(actor_email) = lower($${idx++})`);
    params.push(filters.actorEmail);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = filters?.limit ?? 500;

  return queryAll(
    `SELECT * FROM adm_audit_log ${where} ORDER BY occurred_at DESC, id DESC LIMIT ${limit}`,
    params,
  );
}
