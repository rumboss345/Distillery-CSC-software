import { Router } from 'express';
import {
  computeMaterialLotBalance,
} from '../../db/erp/balance-engine.js';
import {
  postMaterialOpeningBalance,
  postMaterialTransaction,
  transferMaterial,
} from '../../db/erp/handlers/material.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/lots/:lotId/balance', async (req, res) => {
  try {
    const lotId = Number(req.params.lotId);
    const locationId = req.query.locationId != null ? Number(req.query.locationId) : undefined;
    const balance = await computeMaterialLotBalance(lotId, locationId);
    res.json({ lotId, locationId: locationId ?? null, balance });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/opening-balance', async (req, res) => {
  try {
    const txId = await postMaterialOpeningBalance({
      materialType: req.body.materialType,
      rawMaterialId: req.body.rawMaterialId,
      packagingMaterialId: req.body.packagingMaterialId,
      materialLotId: Number(req.body.materialLotId),
      locationId: Number(req.body.locationId),
      quantity: Number(req.body.quantity),
      unit: String(req.body.unit),
      baseQuantity: Number(req.body.baseQuantity),
      baseUnit: String(req.body.baseUnit),
      effectiveDate: req.body.effectiveDate,
      notes: req.body.notes,
      createdBy: req.user?.email ?? null,
    });
    res.status(201).json({ transactionId: txId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/transactions', async (req, res) => {
  try {
    const txId = await postMaterialTransaction({
      transactionType: String(req.body.transactionType),
      materialType: req.body.materialType,
      rawMaterialId: req.body.rawMaterialId,
      packagingMaterialId: req.body.packagingMaterialId,
      materialLotId: req.body.materialLotId,
      sourceLocationId: req.body.sourceLocationId,
      destinationLocationId: req.body.destinationLocationId,
      quantity: Number(req.body.quantity),
      unit: String(req.body.unit),
      baseQuantity: Number(req.body.baseQuantity),
      baseUnit: String(req.body.baseUnit),
      transactionGroupId: req.body.transactionGroupId,
      reasonCode: req.body.reasonCode,
      notes: req.body.notes,
      createdBy: req.user?.email ?? null,
    });
    res.status(201).json({ transactionId: txId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/transfer', async (req, res) => {
  try {
    const groupId = await transferMaterial({
      materialType: req.body.materialType,
      rawMaterialId: req.body.rawMaterialId,
      packagingMaterialId: req.body.packagingMaterialId,
      materialLotId: Number(req.body.materialLotId),
      sourceLocationId: Number(req.body.sourceLocationId),
      destinationLocationId: Number(req.body.destinationLocationId),
      quantity: Number(req.body.quantity),
      unit: String(req.body.unit),
      baseQuantity: Number(req.body.baseQuantity),
      baseUnit: String(req.body.baseUnit),
      notes: req.body.notes,
      createdBy: req.user?.email ?? null,
    });
    res.status(201).json({ transactionGroupId: groupId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

export default router;
