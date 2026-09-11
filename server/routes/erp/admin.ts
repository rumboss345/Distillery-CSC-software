import { Router } from 'express';
import { queryAll } from '../../db/erp/pg-helpers.js';
import { requireErpAction } from '../../middleware/erp-permissions.js';

const router = Router();

router.get('/erp-users', requireErpAction('MANAGE_USERS'), async (_req, res) => {
  try {
    const users = await queryAll(
      'SELECT id, email, display_name, role_code, active, created_at FROM adm_erp_users ORDER BY email',
    );
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list ERP users' });
  }
});

router.get('/status', (_req, res) => {
  res.json({ domain: 'admin', ready: true });
});

export default router;
