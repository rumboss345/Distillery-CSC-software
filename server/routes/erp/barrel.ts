import { Router } from 'express';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ domain: 'barrel', ready: true, note: 'Barrel aging domain registered for cutover' });
});

export default router;
