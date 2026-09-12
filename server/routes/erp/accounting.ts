import { Router } from 'express';
import {
  createExportBatch,
  listAccountingEvents,
  listExportBatches,
} from '../../db/erp/handlers/accounting.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/events', async (req, res) => {
  try {
    const events = await listAccountingEvents({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      eventType: typeof req.query.eventType === 'string' ? req.query.eventType : undefined,
      exportBatchId: req.query.exportBatchId != null ? Number(req.query.exportBatchId) : undefined,
    });
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/export-batches', async (_req, res) => {
  try {
    const batches = await listExportBatches();
    res.json({ batches });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/export-batches', async (req, res) => {
  try {
    const batchId = await createExportBatch({
      eventIds: Array.isArray(req.body.eventIds) ? req.body.eventIds.map(Number) : [],
      exportFormat: String(req.body.exportFormat ?? 'CSV'),
      adapterType: req.body.adapterType,
      idempotencyKey: req.body.idempotencyKey,
      notes: req.body.notes,
    });
    res.status(201).json({ batchId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

export default router;
