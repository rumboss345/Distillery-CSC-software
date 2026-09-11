import { Router } from 'express';
import { placeHold, releaseHold } from '../../db/erp/handlers/quality.js';
import { listQualityHolds, listQualitySamples } from '../../db/erp/read/domain-lists.js';
import { auditErpMutation } from '../../middleware/audit-log.js';
import { requireErpAction } from '../../middleware/erp-permissions.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/holds', async (req, res) => {
  try {
    const holds = await listQualityHolds({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
    });
    res.json({ holds });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/samples', async (req, res) => {
  try {
    const samples = await listQualitySamples({
      sourceEntityType:
        typeof req.query.sourceEntityType === 'string' ? req.query.sourceEntityType : undefined,
      sourceEntityId:
        req.query.sourceEntityId != null ? Number(req.query.sourceEntityId) : undefined,
    });
    res.json({ samples });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post(
  '/holds',
  requireErpAction('PLACE_QA_HOLD'),
  auditErpMutation({
    action: 'PLACE_QA_HOLD',
    entityType: 'qc_hold',
    getAfterState: (_req, body) => body,
  }),
  async (req, res) => {
    try {
      const holdId = await placeHold({
        entityType: String(req.body.entityType),
        entityId: Number(req.body.entityId),
        reason: String(req.body.reason),
        placedBy: req.user?.email ?? null,
      });
      res.status(201).json({ holdId });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  },
);

router.post(
  '/holds/:id/release',
  requireErpAction('RELEASE_QA_HOLD'),
  auditErpMutation({
    action: 'RELEASE_QA_HOLD',
    entityType: 'qc_hold',
    getEntityId: (req) => req.params.id,
    getBeforeState: () => ({ status: 'Active' }),
    getAfterState: () => ({ status: 'Released' }),
  }),
  async (req, res) => {
    try {
      await releaseHold({
        holdId: Number(req.params.id),
        releasedBy: req.user?.email ?? null,
        releaseNotes: req.body.releaseNotes ?? req.body.reason,
      });
      res.json({ holdId: Number(req.params.id), status: 'Released' });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  },
);

export default router;
