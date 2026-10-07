import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function distilleryDataDir(): string {
  return process.env.DATA_DIR ?? join(__dirname, 'data');
}

export interface DistilleryRecord {
  revision: number;
  updatedAt: string | null;
  database: Buffer | null;
  clearedAt: string | null;
}

export type DistilleryWriteResult =
  | { ok: true; revision: number; updatedAt: string }
  | { ok: false; revision: number; updatedAt: string | null; database: Buffer | null; clearedAt: string | null };

interface Meta {
  revision: number;
  updatedAt: string;
  clearedAt: string | null;
}

function paths(dir: string) {
  return {
    dir,
    database: join(dir, 'distillery.sqlite'),
    meta: join(dir, 'distillery-meta.json'),
  };
}

export function isSqliteDatabase(database: Buffer): boolean {
  return database.length >= 16 && database.subarray(0, 15).toString('utf8') === 'SQLite format 3';
}

function readMeta(metaPath: string): Meta {
  if (!existsSync(metaPath)) return { revision: 0, updatedAt: '', clearedAt: null };
  try {
    const parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<Meta>;
    const revision = Number(parsed.revision);
    const clearedAt = typeof parsed.clearedAt === 'string' && parsed.clearedAt ? parsed.clearedAt : null;
    return {
      revision: Number.isInteger(revision) && revision > 0 ? revision : 0,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      clearedAt,
    };
  } catch {
    return { revision: 0, updatedAt: '', clearedAt: null };
  }
}

export function readDistilleryRecord(dir = distilleryDataDir()): DistilleryRecord {
  const file = paths(dir);
  const meta = readMeta(file.meta);
  if (!existsSync(file.database)) {
    return {
      revision: 0,
      updatedAt: meta.updatedAt || null,
      database: null,
      clearedAt: meta.clearedAt,
    };
  }
  const database = readFileSync(file.database);
  return {
    revision: meta.revision > 0 ? meta.revision : 1,
    updatedAt: meta.updatedAt || null,
    database,
    clearedAt: null,
  };
}

export function writeDistilleryRecord(
  baseRevision: number,
  database: Buffer,
  dir = distilleryDataDir(),
): DistilleryWriteResult {
  const current = readDistilleryRecord(dir);
  if (current.revision !== baseRevision) {
    return {
      ok: false,
      revision: current.revision,
      updatedAt: current.updatedAt,
      database: current.database,
      clearedAt: current.clearedAt,
    };
  }
  const file = paths(dir);
  mkdirSync(file.dir, { recursive: true });
  const revision = current.revision + 1;
  const updatedAt = new Date().toISOString();
  const dbTmp = `${file.database}.tmp`;
  const metaTmp = `${file.meta}.tmp`;
  writeFileSync(dbTmp, database);
  writeFileSync(metaTmp, JSON.stringify({ revision, updatedAt }));
  renameSync(dbTmp, file.database);
  renameSync(metaTmp, file.meta);
  return { ok: true, revision, updatedAt };
}

export function clearDistilleryRecord(dir = distilleryDataDir()): { clearedAt: string } {
  const file = paths(dir);
  mkdirSync(file.dir, { recursive: true });
  if (existsSync(file.database)) unlinkSync(file.database);
  const clearedAt = new Date().toISOString();
  writeFileSync(file.meta, JSON.stringify({ revision: 0, updatedAt: clearedAt, clearedAt }));
  return { clearedAt };
}
