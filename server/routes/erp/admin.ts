import { Router } from 'express';
import { listAuditLog, listErpUsers } from '../../db/erp/handlers/admin.js';
import { requireErpAction } from '../../middleware/erp-permissions.js';
import type { ErpActionCode } from '../../../shared/admin/constants.js';

const router = Router();

router.get('/erp-users', requireErpAction('MANAGE_USERS'), async (req, res) => {
  try {
    const users = await listErpUsers(req.query.includeInactive === 'true');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list ERP users' });
  }
});

router.get('/audit-log', requireErpAction('VIEW_AUDIT_LOG'), async (req, res) => {
  try {
    const entries = await listAuditLog({
      actionCode: typeof req.query.actionCode === 'string' ? (req.query.actionCode as ErpActionCode) : undefined,
      entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
      entityId: typeof req.query.entityId === 'string' ? req.query.entityId : undefined,
      actorEmail: typeof req.query.actorEmail === 'string' ? req.query.actorEmail : undefined,
      limit: req.query.limit != null ? Number(req.query.limit) : undefined,
    });
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list audit log' });
  }
});

export default router;
