import { Router } from 'express';
import { withTransaction } from '../db/pool.js';
import { query, queryOne } from '../db/pool.js';
import { adminMiddleware, authMiddleware } from '../middleware/auth.js';
import { getProductionStatus, markProductionAuthoritative, serverHasProductionData } from '../services/production-status.js';
import { importSqlJsIntoPostgres, validateImportedData } from '../services/sqljs-import/importer.js';
import { collectPreview, openSqlJsDatabase } from '../services/sqljs-import/parser.js';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    const status = await getProductionStatus();
    res.json(status);
  } catch (err) {
    res.status(503).json({
      error: err instanceof Error ? err.message : 'Production database unavailable',
      databaseConfigured: false,
      databaseConnected: false,
    });
  }
});

router.post('/migration/preview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const databaseBase64 = String(req.body.databaseBase64 ?? '');
    const sourceLabel = String(req.body.sourceLabel ?? 'browser_export');
    if (!databaseBase64) {
      res.status(400).json({ error: 'databaseBase64 is required' });
      return;
    }

    const db = await openSqlJsDatabase(databaseBase64);
    const preview = collectPreview(db, sourceLabel);
    db.close();

    const serverOccupied = await serverHasProductionData();

    const importRun = await queryOne<{ id: number }>(
      `INSERT INTO data_import_runs (source_label, imported_by_user_id, imported_by_email, status, preview_summary)
       VALUES ($1, $2, $3, 'preview', $4::jsonb)
       RETURNING id`,
      [sourceLabel, req.user!.id, req.user!.email, JSON.stringify(preview)],
    );

    res.json({
      preview,
      importRunId: importRun?.id,
      serverHasExistingData: serverOccupied,
      requiresExplicitReplace: serverOccupied,
      message: serverOccupied
        ? 'Server already contains production data. Import requires explicit replace confirmation and stores a backup first.'
        : 'Preview ready. Confirm import to load this database into the server.',
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Preview failed' });
  }
});

router.post('/migration/import', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const databaseBase64 = String(req.body.databaseBase64 ?? '');
    const confirm = Boolean(req.body.confirm);
    const replaceExisting = Boolean(req.body.replaceExisting);
    const sourceLabel = String(req.body.sourceLabel ?? 'browser_export');
    const backupBase64 = req.body.backupBase64 ? String(req.body.backupBase64) : null;

    if (!databaseBase64) {
      res.status(400).json({ error: 'databaseBase64 is required' });
      return;
    }
    if (!confirm) {
      res.status(400).json({ error: 'confirm must be true to import' });
      return;
    }

    const serverOccupied = await serverHasProductionData();
    if (serverOccupied && !replaceExisting) {
      res.status(409).json({
        error: 'Server already has production data. Set replaceExisting=true after preview to replace it.',
      });
      return;
    }

    const db = await openSqlJsDatabase(databaseBase64);
    const preview = collectPreview(db, sourceLabel);

    const result = await withTransaction(async (client) => {
      const importedCounts = await importSqlJsIntoPostgres(db, client);
      const validation = await validateImportedData(client);

      await queryOne(
        `INSERT INTO data_import_runs
          (source_label, imported_by_user_id, imported_by_email, status, preview_summary, validation_summary, backup_payload, completed_at)
         VALUES ($1, $2, $3, 'imported', $4::jsonb, $5::jsonb, $6, NOW())
         RETURNING id`,
        [
          sourceLabel,
          req.user!.id,
          req.user!.email,
          JSON.stringify(preview),
          JSON.stringify({ importedCounts, validation }),
          backupBase64,
        ],
      );

      return { importedCounts, validation };
    });

    db.close();
    await markProductionAuthoritative(req.user!.email);

    res.json({
      message: 'Import completed successfully. Server database is now the authoritative production source.',
      importedCounts: result.importedCounts,
      validation: result.validation,
    });
  } catch (err) {
    await query(
      `INSERT INTO data_import_runs (source_label, imported_by_user_id, imported_by_email, status, notes, completed_at)
       VALUES ($1, $2, $3, 'failed', $4, NOW())`,
      [
        String(req.body.sourceLabel ?? 'browser_export'),
        req.user!.id,
        req.user!.email,
        err instanceof Error ? err.message : 'Import failed',
      ],
    );
    res.status(500).json({ error: err instanceof Error ? err.message : 'Import failed' });
  }
});

router.get('/migration/history', authMiddleware, adminMiddleware, async (_req, res) => {
  const result = await query(
    `SELECT id, source_label, imported_by_email, status, preview_summary, validation_summary,
            created_at, completed_at
     FROM data_import_runs ORDER BY id DESC LIMIT 20`,
  );
  res.json({ imports: result.rows });
});

export default router;
