import { Router } from 'express';
import { computeFgLotBalance } from '../../db/erp/balance-engine.js';
import { postFgShipment, transferFgLot } from '../../db/erp/handlers/finished-goods.js';
import { requireErpAction } from '../../middleware/erp-permissions.js';
import { auditErpMutation } from '../../middleware/audit-log.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/lots/:lotId/balance', async (req, res) => {
  try {
    const lotId = Number(req.params.lotId);
    const locationId = req.query.locationId != null ? Number(req.query.locationId) : undefined;
    const balance = await computeFgLotBalance(lotId, locationId);
    res.json({ lotId, locationId: locationId ?? null, balance });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/transfer', async (req, res) => {
  try {
    const txId = await transferFgLot({
      fgLotId: Number(req.body.fgLotId),
      sourceLocationId: Number(req.body.sourceLocationId),
      destinationLocationId: Number(req.body.destinationLocationId),
      quantity: Number(req.body.quantity),
      notes: req.body.notes,
      createdBy: req.user?.email ?? null,
    });
    res.status(201).json({ transactionId: txId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post(
  '/shipment',
  requireErpAction('SHIP_FG'),
  auditErpMutation({
    action: 'SHIP_FG',
    entityType: 'fg_lot',
    getEntityId: (req) => req.body.fgLotId,
  }),
  async (req, res) => {
    try {
      const txId = await postFgShipment({
        fgLotId: Number(req.body.fgLotId),
        sourceLocationId: Number(req.body.sourceLocationId),
        quantity: Number(req.body.quantity),
        referenceType: req.body.referenceType,
        referenceId: req.body.referenceId,
        notes: req.body.notes,
        createdBy: req.user?.email ?? null,
      });
      res.status(201).json({ transactionId: txId });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  },
);

export default router;
