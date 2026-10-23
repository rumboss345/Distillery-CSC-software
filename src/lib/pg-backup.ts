export const PG_BACKUP_FORMAT = 'csc-distillery-pg-backup';
export const PG_BACKUP_VERSION = 1;

export const REQUIRED_PG_BACKUP_TABLES = [
  'mash_batches',
  'distillation_runs',
  'distillation_cuts',
  'floor_equipment',
  'inventory_items',
] as const;

export interface PgBackupFile {
  format: typeof PG_BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export function pgBackupError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'This file is not a distillery backup.';
  const record = value as Partial<PgBackupFile>;
  if (record.format !== PG_BACKUP_FORMAT) {
    return 'This file is not a PostgreSQL distillery backup.';
  }
  if (record.version !== PG_BACKUP_VERSION || !record.tables || typeof record.tables !== 'object') {
    return 'This backup file could not be read.';
  }
  const missing = REQUIRED_PG_BACKUP_TABLES.filter((table) => !Array.isArray(record.tables?.[table]));
  if (missing.length > 0) {
    return `This file is not a distillery backup. It is missing: ${missing.join(', ')}.`;
  }
  return null;
}
