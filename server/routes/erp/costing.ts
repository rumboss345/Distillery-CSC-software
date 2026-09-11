import { Router } from 'express';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ domain: 'costing', ready: true, note: 'Costing & COGS domain registered for cutover' });
});

export default router;
