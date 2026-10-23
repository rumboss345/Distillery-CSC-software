import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDistilleryRecord,
  isSqliteDatabase,
  readDistilleryRecord,
  writeDistilleryRecord,
} from './distillery-store';

const sqlite = Buffer.concat([
  Buffer.from('SQLite format 3\0', 'utf8'),
  Buffer.from('shared-record'),
]);

describe('distillery store', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty and keeps one shared revision', () => {
    dir = mkdtempSync(join(tmpdir(), 'distillery-store-'));
    expect(readDistilleryRecord(dir)).toEqual({
      revision: 0,
      updatedAt: null,
      database: null,
      clearedAt: null,
    });

    const first = writeDistilleryRecord(0, sqlite, dir);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.revision).toBe(1);

    const stale = writeDistilleryRecord(0, Buffer.concat([sqlite, Buffer.from('-stale')]), dir);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.revision).toBe(1);
    expect(stale.database?.equals(sqlite)).toBe(true);

    const next = Buffer.concat([sqlite, Buffer.from('-next')]);
    const saved = writeDistilleryRecord(1, next, dir);
    expect(saved.ok).toBe(true);
    expect(readDistilleryRecord(dir).database?.equals(next)).toBe(true);
    expect(readDistilleryRecord(dir).revision).toBe(2);

    const cleared = clearDistilleryRecord(dir);
    const afterClear = readDistilleryRecord(dir);
    expect(afterClear.revision).toBe(0);
    expect(afterClear.database).toBeNull();
    expect(afterClear.clearedAt).toBe(cleared.clearedAt);

    const reseed = writeDistilleryRecord(0, sqlite, dir);
    expect(reseed.ok).toBe(true);
    expect(readDistilleryRecord(dir).revision).toBe(1);
    expect(readDistilleryRecord(dir).clearedAt).toBeNull();
  });

  it('recognizes a SQLite file header', () => {
    expect(isSqliteDatabase(sqlite)).toBe(true);
    expect(isSqliteDatabase(Buffer.from('not sqlite'))).toBe(false);
  });
});
