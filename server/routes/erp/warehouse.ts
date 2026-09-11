import { Router } from 'express';
import {
  createCycleCount,
  listCycleCounts,
  listTransferDocuments,
  postCycleCountReconciliation,
  receiveTransferDocument,
  recordCycleCount,
  releaseTransferDocument,
} from '../../db/erp/handlers/warehouse.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/transfers', async (_req, res) => {
  try {
    const transfers = await listTransferDocuments();
    res.json({ transfers });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/transfers/:id/release', async (req, res) => {
  try {
    await releaseTransferDocument(Number(req.params.id), req.body.shipDate);
    res.json({ transferId: Number(req.params.id), status: 'In Transit' });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/transfers/:id/receive', async (req, res) => {
  try {
    const receipts = Array.isArray(req.body.receipts) ? req.body.receipts : [];
    await receiveTransferDocument(Number(req.params.id), receipts, req.body.receiveDate);
    res.json({ transferId: Number(req.params.id), status: 'Received' });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.get('/cycle-counts', async (_req, res) => {
  try {
    const cycleCounts = await listCycleCounts();
    res.json({ cycleCounts });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/cycle-counts', async (req, res) => {
  try {
    const id = await createCycleCount(
      Number(req.body.locationId),
      req.body.countDate,
      req.user?.email ?? null,
    );
    res.status(201).json({ cycleCountId: id });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/cycle-counts/lines/:lineId/count', async (req, res) => {
  try {
    await recordCycleCount(Number(req.params.lineId), Number(req.body.countedQuantity));
    res.json({ lineId: Number(req.params.lineId) });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/cycle-counts/:id/post', async (req, res) => {
  try {
    await postCycleCountReconciliation(Number(req.params.id));
    res.json({ cycleCountId: Number(req.params.id), status: 'Posted' });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

export default router;
