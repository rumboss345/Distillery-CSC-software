import { createHash } from 'crypto';
import type { Database } from 'sql.js';
import type pg from 'pg';
import { setMigrationState } from '../migration-state.js';
import { buildMigrationValidationReport } from '../migration-validation.js';
import { importSqlJsIntoPostgres } from './importer.js';
import { collectPreview } from './parser.js';

export interface RunImportOptions {
  sourceLabel: string;
  userId: number;
  userEmail: string;
  replaceExisting: boolean;
  replaceConfirmationPhrase?: string;
  backupBase64: string;
  externalBackupAcknowledged: boolean;
}

export interface RunImportResult {
  importRunId: number;
  importedCounts: Record<string, number>;
  validationReport: Awaited<ReturnType<typeof buildMigrationValidationReport>>;
  preview: ReturnType<typeof collectPreview>;
}

export async function runProductionImportTransaction(
  browserDb: Database,
  client: pg.PoolClient,
  options: RunImportOptions,
): Promise<RunImportResult> {
  if (!options.externalBackupAcknowledged) {
    throw new Error('You must download an external browser backup file before importing.');
  }

  const backupBuffer = Buffer.from(options.backupBase64, 'base64');
  const backupSha256 = createHash('sha256').update(backupBuffer).digest('hex');
  const preview = collectPreview(browserDb, options.sourceLabel);

  const existingImport = await client.query<{ id: number }>(
    `SELECT id FROM data_import_runs WHERE backup_sha256 = $1 AND status = 'imported' LIMIT 1`,
    [backupSha256],
  );
  if (existingImport.rows[0] && !options.replaceExisting) {
    throw new Error(
      'This browser database has already been imported. Use replace workflow only if you intentionally need to reload it.',
    );
  }

  const occupied = await client.query<{ total: string }>(`
    SELECT (
      (SELECT COUNT(*) FROM mash_batches) +
      (SELECT COUNT(*) FROM distillation_runs) +
      (SELECT COUNT(*) FROM floor_equipment) +
      (SELECT COUNT(*) FROM inventory_items)
    )::text AS total
  `);
  const serverOccupied = Number(occupied.rows[0]?.total ?? 0) > 0;

  if (serverOccupied) {
    if (!options.replaceExisting) {
      throw new Error('Server already contains production data. Replacement requires explicit confirmation.');
    }
    if (options.replaceConfirmationPhrase !== 'REPLACE SERVER DATA') {
      throw new Error('Type REPLACE SERVER DATA to confirm replacing existing server production data.');
    }
  }

  const importRunInsert = await client.query<{ id: number }>(
    `INSERT INTO data_import_runs
      (source_label, imported_by_user_id, imported_by_email, status, preview_summary,
       backup_blob, backup_size_bytes, backup_sha256, notes)
     VALUES ($1, $2, $3, 'importing', $4::jsonb, $5, $6, $7, $8)
     RETURNING id`,
    [
      options.sourceLabel,
      options.userId,
      options.userEmail,
      JSON.stringify(preview),
      backupBuffer,
      backupBuffer.length,
      backupSha256,
      serverOccupied ? 'replace_existing_confirmed' : '',
    ],
  );
  const importRunId = importRunInsert.rows[0]!.id;

  if (serverOccupied) {
    await client.query(
      `INSERT INTO production_replace_audit
        (import_run_id, performed_by_user_id, performed_by_email, confirmation_phrase, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        importRunId,
        options.userId,
        options.userEmail,
        options.replaceConfirmationPhrase ?? '',
        'Server production data replaced during sql.js import',
      ],
    );
  }

  const importedCounts = await importSqlJsIntoPostgres(browserDb, client, importRunId);
  const validationReport = await buildMigrationValidationReport(browserDb, client);

  await client.query(
    `UPDATE data_import_runs
     SET status = 'imported', validation_summary = $1::jsonb, completed_at = NOW()
     WHERE id = $2`,
    [JSON.stringify({ importedCounts, validationReport }), importRunId],
  );

  await setMigrationState('MIGRATION_IMPORTED', {
    updatedByEmail: options.userEmail,
    lastImportRunId: importRunId,
  }, client);

  return { importRunId, importedCounts, validationReport, preview };
}
