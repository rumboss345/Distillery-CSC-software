import { Router } from 'express';
import { computeLiquidLotVolume } from '../../db/erp/balance-engine.js';
import { postLiquidTransaction, transferLiquid } from '../../db/erp/handlers/liquid.js';
import { listLiquidLots, listLiquidTransactions } from '../../db/erp/read/domain-lists.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/lots', async (req, res) => {
  try {
    const lots = await listLiquidLots(
      typeof req.query.status === 'string' ? req.query.status : undefined,
    );
    res.json({ lots });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const transactions = await listLiquidTransactions({
      lotId: req.query.lotId != null ? Number(req.query.lotId) : undefined,
      tankId: req.query.tankId != null ? Number(req.query.tankId) : undefined,
      limit: req.query.limit != null ? Number(req.query.limit) : undefined,
    });
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/lots/:lotId/volume', async (req, res) => {
  try {
    const lotId = Number(req.params.lotId);
    const tankId = req.query.tankId != null ? Number(req.query.tankId) : undefined;
    const volume = await computeLiquidLotVolume(lotId, tankId);
    res.json({ lotId, tankId: tankId ?? null, ...volume });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/transactions', async (req, res) => {
  try {
    const txId = await postLiquidTransaction({
      transaction_type: String(req.body.transactionType ?? req.body.transaction_type),
      source_tank_id: req.body.sourceTankId ?? req.body.source_tank_id,
      destination_tank_id: req.body.destinationTankId ?? req.body.destination_tank_id,
      source_lot_id: req.body.sourceLotId ?? req.body.source_lot_id,
      destination_lot_id: req.body.destinationLotId ?? req.body.destination_lot_id,
      volume_litres: Number(req.body.volumeLitres ?? req.body.volume_litres),
      abv: Number(req.body.abv),
      reason_code: req.body.reasonCode ?? req.body.reason_code,
      notes: req.body.notes,
      created_by: req.user?.email ?? null,
      transaction_group_id: req.body.transactionGroupId ?? req.body.transaction_group_id,
    });
    res.status(201).json({ transactionId: txId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/transfer', async (req, res) => {
  try {
    const txId = await transferLiquid({
      sourceTankId: Number(req.body.sourceTankId),
      destinationTankId: Number(req.body.destinationTankId),
      sourceLotId: req.body.sourceLotId,
      volumeLitres: Number(req.body.volumeLitres),
      notes: req.body.notes,
      createdBy: req.user?.email ?? null,
    });
    res.status(201).json({ transactionId: txId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

export default router;
