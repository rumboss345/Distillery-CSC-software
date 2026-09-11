import { Router } from 'express';
import { getExecutiveDashboardSummary } from '../../db/erp/handlers/reporting.js';

const router = Router();

router.get('/dashboard', async (_req, res) => {
  try {
    const summary = await getExecutiveDashboardSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Dashboard query failed',
    });
  }
});

export default router;
