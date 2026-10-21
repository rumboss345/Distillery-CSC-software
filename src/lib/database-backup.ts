const SQLITE_HEADER = 'SQLite format 3\u0000';

/** Tables every distillery backup must have. */
export const REQUIRED_BACKUP_TABLES = [
  'mash_batches',
  'distillation_runs',
  'distillation_cuts',
  'floor_equipment',
  'inventory_items',
] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** File name for a backup made at `date`, in local time. */
export function backupFileName(date: Date, prefix = 'csc-distillery-backup'): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${prefix}-${day}-${time}.sqlite`;
}

export function isSqliteFile(data: Uint8Array): boolean {
  if (data.length < SQLITE_HEADER.length) return false;
  for (let i = 0; i < SQLITE_HEADER.length; i += 1) {
    if (data[i] !== SQLITE_HEADER.charCodeAt(i)) return false;
  }
  return true;
}

/** Message when a backup is missing tables, or null when it has them all. */
export function missingBackupTablesError(tables: readonly string[]): string | null {
  const present = new Set(tables);
  const missing = REQUIRED_BACKUP_TABLES.filter((table) => !present.has(table));
  if (missing.length === 0) return null;
  return `This file is not a distillery backup. It is missing: ${missing.join(', ')}.`;
}

export function downloadBytes(data: Uint8Array, fileName: string): void {
  const blob = new Blob([data as BlobPart], { type: 'application/vnd.sqlite3' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
