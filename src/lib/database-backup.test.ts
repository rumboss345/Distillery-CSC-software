import { describe, expect, it } from 'vitest';
import { backupFileName, isSqliteFile, missingBackupTablesError, REQUIRED_BACKUP_TABLES } from './database-backup';

describe('database backup', () => {
  it('names the file with the local date and time', () => {
    expect(backupFileName(new Date(2026, 9, 21, 9, 5))).toBe('csc-distillery-backup-2026-10-21-0905.sqlite');
    expect(backupFileName(new Date(2026, 0, 2, 14, 30), 'csc-distillery-before-restore'))
      .toBe('csc-distillery-before-restore-2026-01-02-1430.sqlite');
  });

  it('recognizes a SQLite file by its header', () => {
    const header = new TextEncoder().encode('SQLite format 3\u0000rest of file');
    expect(isSqliteFile(header)).toBe(true);
    expect(isSqliteFile(new TextEncoder().encode('name,volume\nTank 1,20'))).toBe(false);
    expect(isSqliteFile(new Uint8Array())).toBe(false);
  });

  it('rejects a database without the distillery tables', () => {
    expect(missingBackupTablesError([...REQUIRED_BACKUP_TABLES, 'barrels'])).toBeNull();
    expect(missingBackupTablesError(['users'])).toMatch(/not a distillery backup.*mash_batches/);
  });
});
