import { Router } from 'express';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ domain: 'accounting', ready: true, note: 'Accounting integration domain registered for cutover' });
});

export default router;
