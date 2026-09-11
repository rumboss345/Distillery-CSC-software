import type express from 'express';
import {
  actionRequiresReason,
  ERP_ROLES,
  roleHasPermission,
  type ErpActionCode,
  type ErpRoleCode,
} from '../../shared/admin/constants.js';
import { queryOne } from '../db/pool.js';

export interface ErpActor {
  userId: number | null;
  email: string;
  role: ErpRoleCode;
}

declare global {
  namespace Express {
    interface Request {
      erpActor?: ErpActor;
    }
  }
}

async function resolveErpActor(email: string): Promise<ErpActor | null> {
  const user = await queryOne<{ id: number; email: string; role_code: string }>(
    `SELECT id, email, role_code FROM adm_erp_users
     WHERE lower(email) = lower($1) AND active = TRUE`,
    [email.trim()],
  );
  if (!user) return null;
  if (!ERP_ROLES.includes(user.role_code as ErpRoleCode)) {
    return { userId: user.id, email: user.email, role: 'SALES_READ_ONLY' };
  }
  return { userId: user.id, email: user.email, role: user.role_code as ErpRoleCode };
}

export async function checkErpPermission(
  email: string,
  action: ErpActionCode,
  reason?: string | null,
): Promise<ErpActor> {
  const actor = await resolveErpActor(email);
  if (!actor) {
    throw new Error('ERP user not found or inactive.');
  }
  if (!roleHasPermission(actor.role, action)) {
    throw new Error(`Permission denied: ${actor.role} cannot perform ${action}.`);
  }
  if (actionRequiresReason(action)) {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new Error(`A reason is required for ${action}.`);
    }
  }
  return actor;
}

export function requireErpAction(action: ErpActionCode) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user?.email) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const reason =
      (typeof req.body?.reason === 'string' ? req.body.reason : null) ??
      (typeof req.query?.reason === 'string' ? req.query.reason : null);
    try {
      req.erpActor = await checkErpPermission(req.user.email, action, reason);
      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Permission denied';
      res.status(403).json({ error: message });
    }
  };
}
