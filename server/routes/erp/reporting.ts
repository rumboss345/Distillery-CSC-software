import { Router } from 'express';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ domain: 'reporting', ready: true, note: 'Reporting domain registered for cutover' });
});

export default router;
