import { Router } from 'express';
import { dumpBarrel, fillBarrel, listBarrels, listFills } from '../../db/erp/handlers/barrel.js';

const router = Router();

function safeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed';
}

router.get('/barrels', async (req, res) => {
  try {
    const barrels = await listBarrels({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ barrels });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/fills', async (req, res) => {
  try {
    const fills = await listFills({
      barrelId: req.query.barrelId != null ? Number(req.query.barrelId) : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ fills });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/fills', async (req, res) => {
  try {
    const fillId = await fillBarrel({
      barrelId: Number(req.body.barrelId),
      sourceTankId: Number(req.body.sourceTankId),
      liquidLotId: Number(req.body.liquidLotId),
      volumeLitres: Number(req.body.volumeLitres),
      abv: Number(req.body.abv),
      fillDate: req.body.fillDate,
      notes: req.body.notes,
      createdBy: req.user?.email ?? null,
    });
    res.status(201).json({ fillId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

router.post('/fills/:id/dump', async (req, res) => {
  try {
    const dumpId = await dumpBarrel({
      fillId: Number(req.params.id),
      destinationTankId: Number(req.body.destinationTankId),
      volumeLitres: req.body.volumeLitres != null ? Number(req.body.volumeLitres) : undefined,
      abv: req.body.abv != null ? Number(req.body.abv) : undefined,
      dumpDate: req.body.dumpDate,
      createAgedLot: req.body.createAgedLot,
      agedLotDescription: req.body.agedLotDescription,
      notes: req.body.notes,
      createdBy: req.user?.email ?? null,
    });
    res.status(201).json({ dumpId });
  } catch (err) {
    res.status(400).json({ error: safeError(err) });
  }
});

export default router;
