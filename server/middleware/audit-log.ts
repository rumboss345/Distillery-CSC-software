import type express from 'express';
import type { ErpActionCode } from '../../shared/admin/constants.js';
import { queryOne } from '../db/pool.js';
import type { ErpActor } from './erp-permissions.js';

export interface AuditLogInput {
  action: ErpActionCode;
  entityType?: string | null;
  entityId?: string | number | null;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string | null;
  actor?: ErpActor;
  occurredAt?: string;
}

const now = () => new Date().toISOString();

export async function appendServerAuditLog(input: AuditLogInput): Promise<number> {
  const actor = input.actor ?? { userId: null, email: 'system@local', role: 'ADMINISTRATOR' as const };
  const row = await queryOne<{ id: number }>(
    `INSERT INTO adm_audit_log (
      occurred_at, actor_user_id, actor_email, actor_role, action_code,
      entity_type, entity_id, before_state, after_state, reason, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
    RETURNING id`,
    [
      input.occurredAt ?? now(),
      actor.userId,
      actor.email,
      actor.role,
      input.action,
      input.entityType ?? null,
      input.entityId != null ? String(input.entityId) : null,
      input.beforeState != null ? JSON.stringify(input.beforeState) : null,
      input.afterState != null ? JSON.stringify(input.afterState) : null,
      input.reason?.trim() ?? null,
      now(),
    ],
  );
  return row?.id ?? 0;
}

/** Middleware helper: audit after successful handler when attached to response finish. */
export function auditErpMutation(input: {
  action: ErpActionCode;
  entityType?: string;
  getEntityId?: (req: express.Request) => string | number | undefined;
  getBeforeState?: (req: express.Request) => unknown;
  getAfterState?: (req: express.Request, body: unknown) => unknown;
}) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        void appendServerAuditLog({
          action: input.action,
          entityType: input.entityType,
          entityId: input.getEntityId?.(req),
          beforeState: input.getBeforeState?.(req),
          afterState: input.getAfterState?.(req, body),
          reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
          actor: req.erpActor,
        }).catch((err) => console.error('Audit log write failed:', err));
      }
      return originalJson(body);
    };
    next();
  };
}
