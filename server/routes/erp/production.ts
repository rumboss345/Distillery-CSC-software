import { Router } from 'express';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ domain: 'production', ready: true, note: 'Production orders domain registered for cutover' });
});

export default router;
