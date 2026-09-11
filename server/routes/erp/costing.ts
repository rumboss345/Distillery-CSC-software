import { Router } from 'express';
import {
  getBatchCostBreakdown,
  listLiquidValuations,
  listMaterialValuations,
} from '../../db/erp/handlers/costing.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/valuations/material', async (req, res) => {
  try {
    const valuations = await listMaterialValuations({
      materialType: typeof req.query.materialType === 'string' ? req.query.materialType : undefined,
      costStatus: typeof req.query.costStatus === 'string' ? req.query.costStatus : undefined,
    });
    res.json({ valuations });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/valuations/liquid', async (_req, res) => {
  try {
    const valuations = await listLiquidValuations();
    res.json({ valuations });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/batches/:batchId', async (req, res) => {
  try {
    const breakdown = await getBatchCostBreakdown(Number(req.params.batchId));
    res.json(breakdown);
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

export default router;
