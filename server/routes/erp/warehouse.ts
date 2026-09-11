import { Router } from 'express';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({ domain: 'warehouse', ready: true, note: 'Multi-location transfers via Step 1A foundation' });
});

export default router;
