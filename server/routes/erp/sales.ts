import { Router } from 'express';
import { postShipment } from '../../db/erp/handlers/sales.js';
import { auditErpMutation } from '../../middleware/audit-log.js';
import { requireErpAction } from '../../middleware/erp-permissions.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.post(
  '/shipments/:id/post',
  requireErpAction('SHIP_FG'),
  auditErpMutation({
    action: 'SHIP_FG',
    entityType: 'sal_shipment',
    getEntityId: (req) => req.params.id,
  }),
  async (req, res) => {
    try {
      const shipmentId = Number(req.params.id);
      await postShipment(shipmentId, req.user?.email ?? null);
      res.json({ shipmentId, status: 'Posted' });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  },
);

export default router;
