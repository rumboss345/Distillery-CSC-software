/**
 * Phase 1P — permissions, append-only audit log, document metadata.
 */
import {
  actionRequiresReason,
  ERP_ROLE_LABELS,
  ERP_ROLES,
  roleHasPermission,
  type ErpActionCode,
  type ErpRoleCode,
} from '../../shared/admin/constants';
import type {
  AdmAuditLogEntry,
  AdmDocument,
  AdmErpUser,
  PermissionContext,
  ResolvedActor,
} from '../types/administration';
import { insertRow, queryAll, queryOne, runQuery } from './database';

const SESSION_ACTOR_KEY = 'csc-erp-actor-email';

let testActorOverride: ResolvedActor | null = null;
let testEnforcementDisabled = false;

function now(): string {
  return new Date().toISOString();
}

function administrationTableExists(): boolean {
  const row = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='adm_erp_users'",
  );
  return row != null;
}

function nextDocumentCode(): string {
  const row = queryOne<{ n: number }>(
    `SELECT COUNT(*) + 1 AS n FROM adm_documents WHERE document_code LIKE 'DOC-%'`,
  );
  return `DOC-${String(row?.n ?? 1).padStart(6, '0')}`;
}

export function __injectActorForTests(actor: ResolvedActor | null): void {
  testActorOverride = actor;
}

export function __setPermissionEnforcementForTests(enabled: boolean): void {
  testEnforcementDisabled = !enabled;
}

function isAdministrationSeeded(): boolean {
  if (!administrationTableExists()) return false;
  const row = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM adm_erp_users');
  return (row?.count ?? 0) > 0;
}

export function seedAdministrationIfEmpty(defaultAdminEmail = 'admin@csc.local'): void {
  const count = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM adm_erp_users')?.count ?? 0;
  if (count > 0) return;

  insertRow(
    `INSERT INTO adm_erp_users (email, display_name, role_code, active, notes, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
    [defaultAdminEmail, 'System Administrator', 'ADMINISTRATOR', 'Seeded default administrator', now(), now()],
  );
}

export function listErpUsers(includeInactive = false): AdmErpUser[] {
  if (!administrationTableExists()) return [];
  if (includeInactive) {
    return queryAll<AdmErpUser>('SELECT * FROM adm_erp_users ORDER BY email');
  }
  return queryAll<AdmErpUser>('SELECT * FROM adm_erp_users WHERE active = 1 ORDER BY email');
}

export function getErpUser(id: number): AdmErpUser | null {
  return queryOne<AdmErpUser>('SELECT * FROM adm_erp_users WHERE id = ?', [id]);
}

export function getErpUserByEmail(email: string): AdmErpUser | null {
  if (!administrationTableExists()) return null;
  return queryOne<AdmErpUser>(
    'SELECT * FROM adm_erp_users WHERE lower(email) = lower(?) AND active = 1',
    [email.trim()],
  );
}

export function createErpUser(input: {
  email: string;
  displayName: string;
  roleCode: ErpRoleCode;
  notes?: string;
}): number {
  if (!ERP_ROLES.includes(input.roleCode)) {
    throw new Error(`Invalid role: ${input.roleCode}`);
  }
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM adm_erp_users WHERE lower(email) = lower(?)',
    [input.email.trim()],
  );
  if (existing) throw new Error('An ERP user with this email already exists.');

  return insertRow(
    `INSERT INTO adm_erp_users (email, display_name, role_code, active, notes, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
    [input.email.trim(), input.displayName.trim(), input.roleCode, input.notes ?? '', now(), now()],
  );
}

export function updateErpUserRole(userId: number, roleCode: ErpRoleCode): void {
  if (!ERP_ROLES.includes(roleCode)) throw new Error(`Invalid role: ${roleCode}`);
  const user = getErpUser(userId);
  if (!user) throw new Error('ERP user not found.');
  runQuery('UPDATE adm_erp_users SET role_code = ?, updated_at = ? WHERE id = ?', [roleCode, now(), userId]);
}

export function deactivateErpUser(userId: number): void {
  const user = getErpUser(userId);
  if (!user) throw new Error('ERP user not found.');
  runQuery('UPDATE adm_erp_users SET active = 0, updated_at = ? WHERE id = ?', [now(), userId]);
}

export function setSessionActorEmail(email: string): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(SESSION_ACTOR_KEY, email.trim());
  }
}

export function getSessionActorEmail(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(SESSION_ACTOR_KEY);
}

export function resolveActor(ctx?: PermissionContext): ResolvedActor {
  if (testActorOverride) return testActorOverride;

  const email = ctx?.actorEmail?.trim() ?? getSessionActorEmail();
  if (email) {
    const user = getErpUserByEmail(email);
    if (user) {
      return { userId: user.id, email: user.email, role: user.role_code };
    }
    if (ctx?.actorRole) {
      return { userId: null, email, role: ctx.actorRole };
    }
  }

  if (!isAdministrationSeeded()) {
    return { userId: null, email: email ?? 'system@local', role: 'ADMINISTRATOR' };
  }

  if (administrationTableExists()) {
    const fallback = queryOne<AdmErpUser>(
      "SELECT * FROM adm_erp_users WHERE role_code = 'ADMINISTRATOR' AND active = 1 ORDER BY id LIMIT 1",
    );
    if (fallback) {
      return { userId: fallback.id, email: fallback.email, role: fallback.role_code };
    }
  }

  return { userId: null, email: email ?? 'unknown@local', role: 'SALES_READ_ONLY' };
}

export function assertPermission(action: ErpActionCode, ctx?: PermissionContext): ResolvedActor {
  if (testEnforcementDisabled) return resolveActor(ctx);

  const actor = resolveActor(ctx);
  if (!isAdministrationSeeded()) return actor;

  if (!roleHasPermission(actor.role, action)) {
    const label = ERP_ROLE_LABELS[actor.role] ?? actor.role;
    throw new Error(`Permission denied: ${label} cannot perform ${action}.`);
  }

  if (actionRequiresReason(action)) {
    const reason = ctx?.reason?.trim();
    if (!reason) {
      throw new Error(`A reason is required for ${action}.`);
    }
  }

  return actor;
}

function ensureAuditTable(): boolean {
  return queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='adm_audit_log'",
  ) != null;
}

export function appendAuditLog(input: {
  action: ErpActionCode;
  entityType?: string | null;
  entityId?: string | number | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
  actor?: ResolvedActor;
  occurredAt?: string;
}): number {
  if (!ensureAuditTable()) return 0;
  const actor = input.actor ?? resolveActor();
  const beforeJson = input.beforeState != null ? JSON.stringify(input.beforeState) : null;
  const afterJson = input.afterState != null ? JSON.stringify(input.afterState) : null;

  return insertRow(
    `INSERT INTO adm_audit_log (
      occurred_at, actor_user_id, actor_email, actor_role, action_code,
      entity_type, entity_id, before_state, after_state, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.occurredAt ?? now(),
      actor.userId,
      actor.email,
      actor.role,
      input.action,
      input.entityType ?? null,
      input.entityId != null ? String(input.entityId) : null,
      beforeJson,
      afterJson,
      input.reason?.trim() ?? null,
      now(),
    ],
  );
}

/** Enforce permission and append audit entry for a sensitive mutation. */
export function guardSensitiveAction(input: {
  action: ErpActionCode;
  permissionCtx?: PermissionContext;
  entityType?: string;
  entityId?: string | number;
  beforeState?: unknown;
  afterState?: unknown;
}): ResolvedActor {
  const actor = assertPermission(input.action, input.permissionCtx);
  appendAuditLog({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    reason: input.permissionCtx?.reason,
    actor,
  });
  return actor;
}

export function listAuditLog(filters?: {
  actionCode?: ErpActionCode;
  entityType?: string;
  entityId?: string;
  actorEmail?: string;
  limit?: number;
}): AdmAuditLogEntry[] {
  if (!ensureAuditTable()) return [];
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.actionCode) {
    clauses.push('action_code = ?');
    params.push(filters.actionCode);
  }
  if (filters?.entityType) {
    clauses.push('entity_type = ?');
    params.push(filters.entityType);
  }
  if (filters?.entityId) {
    clauses.push('entity_id = ?');
    params.push(filters.entityId);
  }
  if (filters?.actorEmail) {
    clauses.push('lower(actor_email) = lower(?)');
    params.push(filters.actorEmail);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = filters?.limit ?? 500;

  return queryAll<AdmAuditLogEntry>(
    `SELECT * FROM adm_audit_log ${where} ORDER BY occurred_at DESC, id DESC LIMIT ${limit}`,
    params,
  );
}

export function getAuditLogEntry(id: number): AdmAuditLogEntry | null {
  return queryOne<AdmAuditLogEntry>('SELECT * FROM adm_audit_log WHERE id = ?', [id]);
}

export function createDocument(input: {
  title: string;
  documentType: string;
  fileName: string;
  storageUri: string;
  entityType?: string | null;
  entityId?: string | number | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  uploadedBy?: string | null;
  notes?: string;
}): number {
  assertPermission('MANAGE_DOCUMENTS');
  const code = nextDocumentCode();
  return insertRow(
    `INSERT INTO adm_documents (
      document_code, title, document_type, entity_type, entity_id,
      file_name, mime_type, file_size_bytes, storage_uri,
      uploaded_by, uploaded_at, notes, active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      code,
      input.title.trim(),
      input.documentType.trim(),
      input.entityType ?? null,
      input.entityId != null ? String(input.entityId) : null,
      input.fileName.trim(),
      input.mimeType ?? null,
      input.fileSizeBytes ?? null,
      input.storageUri.trim(),
      input.uploadedBy ?? null,
      now(),
      input.notes ?? '',
      now(),
    ],
  );
}

export function listDocuments(filters?: {
  entityType?: string;
  entityId?: string;
  documentType?: string;
  activeOnly?: boolean;
}): AdmDocument[] {
  const hasDocs = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='adm_documents'",
  );
  if (!hasDocs) return [];
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.activeOnly !== false) {
    clauses.push('active = 1');
  }
  if (filters?.entityType) {
    clauses.push('entity_type = ?');
    params.push(filters.entityType);
  }
  if (filters?.entityId) {
    clauses.push('entity_id = ?');
    params.push(filters.entityId);
  }
  if (filters?.documentType) {
    clauses.push('document_type = ?');
    params.push(filters.documentType);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<AdmDocument>(
    `SELECT * FROM adm_documents ${where} ORDER BY uploaded_at DESC, id DESC`,
    params,
  );
}

export function getDocument(id: number): AdmDocument | null {
  return queryOne<AdmDocument>('SELECT * FROM adm_documents WHERE id = ?', [id]);
}

export function deactivateDocument(id: number): void {
  assertPermission('MANAGE_DOCUMENTS');
  const doc = getDocument(id);
  if (!doc) throw new Error('Document not found.');
  runQuery('UPDATE adm_documents SET active = 0 WHERE id = ?', [id]);
}

export function canPerformAction(action: ErpActionCode, ctx?: PermissionContext): boolean {
  if (testEnforcementDisabled || !isAdministrationSeeded()) return true;
  const actor = resolveActor(ctx);
  return roleHasPermission(actor.role, action);
}
