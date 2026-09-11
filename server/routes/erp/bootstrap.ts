import { Router } from 'express';
import { exportAllErpTables } from '../../db/erp/read/bootstrap.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const tables = await exportAllErpTables();
    res.json({ tables, exportedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Bootstrap export failed' });
  }
});

export default router;
