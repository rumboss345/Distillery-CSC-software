import { Router, type Request, type Response, type NextFunction } from 'express';
import { isDatabaseConfigured } from '../config.js';
import { withTransaction } from '../db/pool.js';
import { query, queryOne } from '../db/pool.js';
import { adminMiddleware, authMiddleware } from '../middleware/auth.js';
import {
  getMigrationStateRecord,
  setMigrationState,
  isServerApiCutoverReady,
} from '../services/migration-state.js';
import { getProductionStatus } from '../services/production-status.js';
import { buildMigrationValidationReport } from '../services/migration-validation.js';
import { runProductionImportTransaction } from '../services/sqljs-import/run-import.js';
import { collectPreview, openSqlJsDatabase } from '../services/sqljs-import/parser.js';
import { serverHasProductionData } from '../services/production-status-helpers.js';
import { evaluateCutoverReadiness } from '../services/cutover-readiness.js';
import { buildErpReconciliationReport, persistReconciliationRun } from '../services/reconciliation/erp-reconciliation.js';

const router = Router();

function requirePostgresConfigured(req: Request, res: Response, next: NextFunction) {
  if (!isDatabaseConfigured()) {
    res.status(503).json({
      error: 'PostgreSQL is not configured. Set DATABASE_URL to enable central database migration features.',
    });
    return;
  }
  next();
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

router.get('/status', async (_req, res) => {
  try {
    const status = await getProductionStatus();
    res.json(status);
  } catch {
    res.status(503).json({
      error: 'Production database unavailable',
      migrationState: 'LOCAL_ONLY',
      browserAuthoritative: true,
      serverAuthoritative: false,
    });
  }
});

router.post('/migration/preview', authMiddleware, adminMiddleware, requirePostgresConfigured, async (req, res) => {
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
      externalBackupRequired: true,
      message: serverOccupied
        ? 'Server already contains production data. Replacement requires typing REPLACE SERVER DATA and an external browser backup file.'
        : 'Preview ready. Download an external browser backup, then confirm import.',
    });
  } catch (err) {
    res.status(400).json({ error: safeErrorMessage(err) });
  }
});

router.post('/migration/import', authMiddleware, adminMiddleware, requirePostgresConfigured, async (req, res) => {
  let browserDb: Awaited<ReturnType<typeof openSqlJsDatabase>> | null = null;
  try {
    const databaseBase64 = String(req.body.databaseBase64 ?? '');
    const confirm = Boolean(req.body.confirm);
    const replaceExisting = Boolean(req.body.replaceExisting);
    const replaceConfirmationPhrase = String(req.body.replaceConfirmationPhrase ?? '');
    const sourceLabel = String(req.body.sourceLabel ?? 'browser_export');
    const backupBase64 = String(req.body.backupBase64 ?? '');
    const externalBackupAcknowledged = Boolean(req.body.externalBackupAcknowledged);

    if (!databaseBase64 || !confirm) {
      res.status(400).json({ error: 'databaseBase64 and confirm=true are required' });
      return;
    }
    if (!backupBase64) {
      res.status(400).json({ error: 'Download and submit an external browser backup before importing.' });
      return;
    }
    if (!externalBackupAcknowledged) {
      res.status(400).json({
        error: 'Confirm that an external browser backup has been downloaded and stored outside PostgreSQL.',
      });
      return;
    }

    browserDb = await openSqlJsDatabase(databaseBase64);

    const result = await withTransaction((client) =>
      runProductionImportTransaction(browserDb!, client, {
        sourceLabel,
        userId: req.user!.id,
        userEmail: req.user!.email,
        replaceExisting,
        replaceConfirmationPhrase,
        backupBase64,
        externalBackupAcknowledged,
      }),
    );

    browserDb.close();
    browserDb = null;

    res.json({
      message:
        'Import completed. Central database imported but production screens are still operating from the browser database. Server cutover has NOT occurred.',
      migrationState: 'MIGRATION_IMPORTED',
      importRunId: result.importRunId,
      importedCounts: result.importedCounts,
      validationReport: result.validationReport,
      nextStep: 'Run validation review, then use Activate Central Database when Step 1A API is ready.',
    });
  } catch (err) {
    if (browserDb) browserDb.close();
    const failureMessage = safeErrorMessage(err);
    try {
      await query(
        `INSERT INTO data_import_runs
          (source_label, imported_by_user_id, imported_by_email, status, notes, completed_at)
         VALUES ($1, $2, $3, 'failed', $4, NOW())`,
        [
          String(req.body.sourceLabel ?? 'browser_export'),
          req.user!.id,
          req.user!.email,
          failureMessage.slice(0, 2000),
        ],
      );
    } catch (auditErr) {
      console.error('Failed to record import failure audit:', auditErr);
    }
    res.status(500).json({ error: failureMessage });
  }
});

router.post('/migration/validate', authMiddleware, adminMiddleware, requirePostgresConfigured, async (req, res) => {
  let browserDb: Awaited<ReturnType<typeof openSqlJsDatabase>> | null = null;
  try {
    const databaseBase64 = String(req.body.databaseBase64 ?? '');
    if (!databaseBase64) {
      res.status(400).json({ error: 'databaseBase64 is required for validation comparison' });
      return;
    }

    browserDb = await openSqlJsDatabase(databaseBase64);
    const report = await withTransaction((client) =>
      buildMigrationValidationReport(browserDb!, client),
    );
    browserDb.close();
    browserDb = null;

    await setMigrationState('SERVER_READ_ONLY_VALIDATION', {
      updatedByEmail: req.user!.email,
    });

    res.json({
      migrationState: 'SERVER_READ_ONLY_VALIDATION',
      report,
      message: 'Validation complete. Browser database remains authoritative until cutover.',
    });
  } catch (err) {
    if (browserDb) browserDb.close();
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

router.post('/migration/activate', authMiddleware, adminMiddleware, requirePostgresConfigured, async (req, res) => {
  try {
    const confirm = Boolean(req.body.confirm);
    const override = Boolean(req.body.override);
    const overrideReason = String(req.body.overrideReason ?? '');
    const databaseBase64 = String(req.body.databaseBase64 ?? '');

    if (!confirm) {
      res.status(400).json({ error: 'confirm=true is required to activate the central database' });
      return;
    }

    const state = await getMigrationStateRecord();
    if (state.state === 'SERVER_AUTHORITATIVE') {
      res.status(409).json({ error: 'Central database is already active.' });
      return;
    }

    if (state.state !== 'MIGRATION_IMPORTED' && state.state !== 'SERVER_READ_ONLY_VALIDATION') {
      res.status(409).json({ error: 'Import and validation must be completed before cutover.' });
      return;
    }

    const apiReady = await isServerApiCutoverReady();
    if (!apiReady) {
      res.status(409).json({
        error: 'Cannot activate central database until Step 1A production API writes are implemented.',
      });
      return;
    }

    if (!databaseBase64) {
      res.status(400).json({ error: 'Submit browser database export for final validation before cutover.' });
      return;
    }

    const browserDb = await openSqlJsDatabase(databaseBase64);
    let report;
    await withTransaction(async (client) => {
      report = await buildMigrationValidationReport(browserDb, client);
    });
    browserDb.close();

    if (!report!.passed && !override) {
      res.status(409).json({
        error: 'Validation failed. Fix discrepancies or provide an administrator override with reason.',
        report,
      });
      return;
    }

    if (override && !overrideReason.trim()) {
      res.status(400).json({ error: 'overrideReason is required when using administrator override.' });
      return;
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO production_cutover_audit
          (import_run_id, performed_by_user_id, performed_by_email, previous_state, new_state,
           validation_passed, validation_summary, override_used, override_reason)
         VALUES ($1, $2, $3, $4, 'SERVER_AUTHORITATIVE', $5, $6::jsonb, $7, $8)`,
        [
          state.lastImportRunId,
          req.user!.id,
          req.user!.email,
          state.state,
          report!.passed,
          JSON.stringify(report),
          override,
          override ? overrideReason : null,
        ],
      );
      await setMigrationState('SERVER_AUTHORITATIVE', {
        updatedByEmail: req.user!.email,
        lastImportRunId: state.lastImportRunId,
      }, client);
    });

    res.json({
      message: 'Central database activated. Reload the application. Browser production writes are now disabled.',
      migrationState: 'SERVER_AUTHORITATIVE',
      reloadRequired: true,
    });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

router.get('/cutover-readiness', authMiddleware, adminMiddleware, requirePostgresConfigured, async (_req, res) => {
  try {
    const report = await evaluateCutoverReadiness();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

router.post('/migration/reconcile-erp', authMiddleware, adminMiddleware, requirePostgresConfigured, async (req, res) => {
  let browserDb: Awaited<ReturnType<typeof openSqlJsDatabase>> | null = null;
  try {
    const databaseBase64 = String(req.body.databaseBase64 ?? '');
    if (!databaseBase64) {
      res.status(400).json({ error: 'databaseBase64 is required' });
      return;
    }
    browserDb = await openSqlJsDatabase(databaseBase64);
    let report;
    const runId = await withTransaction(async (client) => {
      report = await buildErpReconciliationReport(browserDb!, client);
      return persistReconciliationRun(report!, req.user!.email);
    });
    browserDb.close();
    browserDb = null;
    res.json({ runId, report, passed: report!.passed });
  } catch (err) {
    if (browserDb) browserDb.close();
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

router.get('/migration/history', authMiddleware, adminMiddleware, requirePostgresConfigured, async (_req, res) => {
  const result = await query(
    `SELECT id, source_label, imported_by_email, status, preview_summary, validation_summary,
            backup_size_bytes, backup_sha256, notes, created_at, completed_at
     FROM data_import_runs ORDER BY id DESC LIMIT 20`,
  );
  res.json({ imports: result.rows });
});

export default router;
