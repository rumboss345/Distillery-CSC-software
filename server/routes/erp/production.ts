import { Router } from 'express';
import {
  completeBatch,
  listProductionBatches,
  listProductionOrders,
  recordBatchInput,
} from '../../db/erp/handlers/production.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/orders', async (req, res) => {
  try {
    const orders = await listProductionOrders(
      typeof req.query.status === 'string' ? req.query.status : undefined,
    );
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/batches', async (req, res) => {
  try {
    const batches = await listProductionBatches(
      req.query.orderId != null ? Number(req.query.orderId) : undefined,
    );
    res.json({ batches });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/batches/:id/inputs', async (req, res) => {
  try {
    const inputId = await recordBatchInput({
      batchId: Number(req.params.id),
      requirementId: req.body.requirementId,
      inputType: String(req.body.inputType),
      rawMaterialId: req.body.rawMaterialId,
      bulkSpiritId: req.body.bulkSpiritId,
      liquidLotId: req.body.liquidLotId,
      sourceTankId: req.body.sourceTankId,
      packagingMaterialId: req.body.packagingMaterialId,
      materialLotId: req.body.materialLotId,
      sourceLocationId: req.body.sourceLocationId,
      actualQuantity: Number(req.body.actualQuantity),
      unit: String(req.body.unit),
      actualVolumeLitres: req.body.actualVolumeLitres,
      actualAbv: req.body.actualAbv,
      notes: req.body.notes,
    });
    res.status(201).json({ inputId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/batches/:id/complete', async (req, res) => {
  try {
    const result = await completeBatch({
      batchId: Number(req.params.id),
      destinationTankId: Number(req.body.destinationTankId),
      actualOutputLitres: Number(req.body.actualOutputLitres),
      actualOutputAbv: Number(req.body.actualOutputAbv),
      outputLotType: req.body.outputLotType,
      outputDescription: req.body.outputDescription,
      actualBrix: req.body.actualBrix,
      actualPh: req.body.actualPh,
      actualCarbonationVolumes: req.body.actualCarbonationVolumes,
      notes: req.body.notes,
      operatorId: req.user?.email ?? null,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

export default router;
