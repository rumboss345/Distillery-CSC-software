import { Router } from 'express';
import { postShipment } from '../../db/erp/handlers/sales.js';
import { listSalesOrders, listShipments } from '../../db/erp/read/domain-lists.js';
import { auditErpMutation } from '../../middleware/audit-log.js';
import { requireErpAction } from '../../middleware/erp-permissions.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/orders', async (req, res) => {
  try {
    const orders = await listSalesOrders({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      customerId: req.query.customerId != null ? Number(req.query.customerId) : undefined,
    });
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/shipments', async (req, res) => {
  try {
    const shipments = await listShipments({
      salesOrderId: req.query.salesOrderId != null ? Number(req.query.salesOrderId) : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ shipments });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

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
