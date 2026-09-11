import { Router } from 'express';
import { isAllowlistedErpTable } from '../../db/erp/read/allowlist.js';
import { readAllowlistedTable } from '../../db/erp/read/table-read.js';

const router = Router();

router.get('/:table', async (req, res) => {
  const table = req.params.table;
  if (!isAllowlistedErpTable(table)) {
    res.status(404).json({ error: `Table "${table}" is not allowlisted for read access.` });
    return;
  }

  try {
    const filters: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'limit' || key === 'offset' || key === 'orderBy' || key === 'orderDir') continue;
      if (typeof value === 'string') {
        if (value === 'true') filters[key] = true;
        else if (value === 'false') filters[key] = false;
        else if (/^-?\d+(\.\d+)?$/.test(value)) filters[key] = Number(value);
        else filters[key] = value;
      }
    }

    const rows = await readAllowlistedTable(table, {
      filters,
      limit: req.query.limit != null ? Number(req.query.limit) : undefined,
      offset: req.query.offset != null ? Number(req.query.offset) : undefined,
      orderBy: typeof req.query.orderBy === 'string' ? req.query.orderBy : undefined,
      orderDir: req.query.orderDir === 'desc' ? 'desc' : 'asc',
    });

    res.json({ table, count: rows.length, rows });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Read failed' });
  }
});

export default router;
