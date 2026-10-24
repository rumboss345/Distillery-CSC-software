import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs, { type Database as SqlDatabase } from 'sql.js';
import { mutationTargetId, PRODUCTION_MUTATIONS } from '../src/db/production-catalog.ts';
import { PG_BACKUP_FORMAT, PG_BACKUP_VERSION, pgBackupError, type PgBackupFile } from '../src/lib/pg-backup.ts';
import { SCHEMA } from '../src/db/schema.ts';
import { bindSqlHandle, type SqlHandle } from '../src/db/sql-session.ts';
import * as queries from '../src/db/queries.ts';
import {
  ARCHIVE_OLD_AUDIT_DELETE,
  ARCHIVE_OLD_AUDIT_INSERT,
  auditArchiveCutoff,
} from '../src/lib/audit-archive.ts';
import { getPool, redactDatabaseUrl } from './pg.ts';

export interface AuditEventRow {
  id: number;
  email: string;
  action: string;
  summary: string;
  created_at: string;
}

const wasmPath = join(dirname(fileURLToPath(import.meta.url)), '../node_modules/sql.js/dist/sql-wasm.wasm');

export class ProductionConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionConflict';
  }
}

interface Actor {
  id: number;
  email: string;
}

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let memory: SqlDatabase | null = null;
let memoryRevision = -1;
const rowHashes = new Map<string, { rev: number; hash: string }>();

function hashRow(row: Record<string, unknown>): string {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) {
    const value = row[key];
    normalized[key] = typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value * 1e6) / 1e6
      : value ?? null;
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function tableNames(db: SqlDatabase): string[] {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const names: string[] = [];
  while (stmt.step()) names.push(String(stmt.get()[0]));
  stmt.free();
  return names;
}

function columns(db: SqlDatabase, table: string): string[] {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const names: string[] = [];
  while (stmt.step()) names.push(String(stmt.get()[1]));
  stmt.free();
  return names;
}

function rowsOf(db: SqlDatabase, table: string): Record<string, unknown>[] {
  const stmt = db.prepare(`SELECT * FROM ${table}`);
  const rows: Record<string, unknown>[] = [];
  const cols = columns(db, table);
  while (stmt.step()) {
    const values = stmt.get();
    const row: Record<string, unknown> = {};
    cols.forEach((col, index) => {
      row[col] = values[index] ?? null;
    });
    rows.push(row);
  }
  stmt.free();
  return rows;
}

async function sqlModule(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!SQL) {
    SQL = await initSqlJs({ wasmBinary: readFileSync(wasmPath) });
  }
  return SQL;
}

function attach(db: SqlDatabase): void {
  memory = db;
  bindSqlHandle(() => memory as unknown as SqlHandle | null);
}

async function reloadFromPostgres(client: import('pg').PoolClient): Promise<void> {
  const sql = await sqlModule();
  const db = new sql.Database();
  db.run('PRAGMA foreign_keys = OFF');
  db.run(SCHEMA);
  const names = tableNames(db);
  for (const table of names) {
    const cols = columns(db, table);
    const result = await client.query(`SELECT ${cols.map((col) => `"${col}"`).join(', ')} FROM ${table}`);
    const placeholders = cols.map(() => '?').join(', ');
    const insert = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`);
    for (const row of result.rows) {
      insert.run(cols.map((col) => row[col] ?? null));
    }
    insert.free();
  }
  const revisions = await client.query('SELECT table_name, row_id, change_rev, row_hash FROM production_row_revisions');
  rowHashes.clear();
  for (const row of revisions.rows) {
    rowHashes.set(`${row.table_name}:${row.row_id}`, { rev: Number(row.change_rev), hash: String(row.row_hash) });
  }
  const meta = await client.query('SELECT revision FROM production_meta WHERE id = 1');
  memoryRevision = Number(meta.rows[0]?.revision ?? 0);
  if (memory) memory.close();
  attach(db);
}

async function persistToPostgres(client: import('pg').PoolClient, nextRevision: number): Promise<void> {
  if (!memory) throw new Error('Database not initialized');
  const names = tableNames(memory);
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  for (const table of names) {
    await client.query(`DELETE FROM ${table}`);
  }
  await client.query('DELETE FROM production_row_revisions');
  for (const table of names) {
    const cols = columns(memory, table);
    const rows = rowsOf(memory, table);
    for (const row of rows) {
      const values = cols.map((col) => row[col] ?? null);
      const params = values.map((_, index) => `$${index + 1}`).join(', ');
      await client.query(
        `INSERT INTO ${table} (${cols.map((col) => `"${col}"`).join(', ')}) VALUES (${params})`,
        values,
      );
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      const hash = hashRow(row);
      const previous = rowHashes.get(`${table}:${id}`);
      const rev = previous && previous.hash === hash ? previous.rev : nextRevision;
      rowHashes.set(`${table}:${id}`, { rev, hash });
      await client.query(
        `INSERT INTO production_row_revisions (table_name, row_id, change_rev, row_hash) VALUES ($1, $2, $3, $4)`,
        [table, id, rev, hash],
      );
    }
    const maxId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
    if (maxId > 0) {
      await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), $2, true)`, [table, maxId]);
    }
  }
  await client.query('UPDATE production_meta SET revision = $1, updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE \'UTC\', \'YYYY-MM-DD HH24:MI:SS\') WHERE id = 1', [nextRevision]);
  memoryRevision = nextRevision;
}

export async function initProductionEngine(): Promise<void> {
  const client = await getPool().connect();
  try {
    await reloadFromPostgres(client);
  } finally {
    client.release();
  }
}

export function productionRevision(): number {
  return memoryRevision < 0 ? 0 : memoryRevision;
}

export function productionSnapshot(): string {
  if (!memory) throw new Error('Database not initialized');
  return Buffer.from(memory.export()).toString('base64');
}

/** Read the server snapshot through the same query module that saves use. */
export function readProduction<T>(read: (api: typeof queries) => T): T {
  return read(queries);
}

function auditSummary(name: string, targetId: number | null): string {
  const words = name.replace(/([A-Z])/g, ' $1').trim();
  const sentence = words.charAt(0).toUpperCase() + words.slice(1);
  const text = targetId != null ? `${sentence} #${targetId}` : sentence;
  return text.slice(0, 500);
}

function callMutation(name: string, args: unknown[]): unknown {
  const fn = (queries as Record<string, unknown>)[name];
  if (typeof fn !== 'function') throw new Error('That action is not available.');
  return fn(...args);
}

export async function runProductionMutation(
  name: string,
  args: unknown[],
  actor: Actor,
  baseRevision: number,
): Promise<{ result: unknown; revision: number; snapshot: string }> {
  const mutation = PRODUCTION_MUTATIONS[name];
  if (!mutation) throw new Error('That action is not available.');
  const client = await getPool().connect();
  let snapshotBefore: Uint8Array | null = null;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [841_234]);
    await client.query('SELECT revision FROM production_meta WHERE id = 1 FOR UPDATE');
    await reloadFromPostgres(client);
    const targetId = mutationTargetId(mutation, args);
    if (mutation.table && targetId != null) {
      const current = rowHashes.get(`${mutation.table}:${targetId}`);
      if (current && current.rev > baseRevision) {
        throw new ProductionConflict('Someone else saved this record. The screen now shows their version.');
      }
    }
    snapshotBefore = memory!.export();
    const result = callMutation(name, args);
    const nextRevision = memoryRevision + 1;
    await persistToPostgres(client, nextRevision);
    const summary = auditSummary(name, targetId);
    await client.query(
      `INSERT INTO audit_events (user_id, email, action, summary) VALUES ($1, $2, $3, $4)`,
      [actor.id, actor.email, name, summary.slice(0, 500)],
    );
    await client.query('COMMIT');
    return { result: result ?? null, revision: memoryRevision, snapshot: productionSnapshot() };
  } catch (error) {
    await client.query('ROLLBACK');
    if (snapshotBefore && SQL) {
      if (memory) memory.close();
      attach(new SQL.Database(snapshotBefore));
    }
    const message = error instanceof Error ? error.message : 'The change could not be saved.';
    if (error instanceof ProductionConflict) throw error;
    throw new Error(redactDatabaseUrl(message));
  } finally {
    client.release();
  }
}

export async function exportProductionBackup(): Promise<PgBackupFile> {
  if (!memory) await initProductionEngine();
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of tableNames(memory!)) {
    tables[table] = rowsOf(memory!, table);
  }
  return {
    format: PG_BACKUP_FORMAT,
    version: PG_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export async function restoreProductionBackup(value: unknown, actor: Actor): Promise<{ revision: number; snapshot: string }> {
  const error = pgBackupError(value);
  if (error) throw new Error(error);
  const backup = value as PgBackupFile;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [841_234]);
    await reloadFromPostgres(client);
    const sql = await sqlModule();
    const db = new sql.Database();
    db.run('PRAGMA foreign_keys = OFF');
    db.run(SCHEMA);
    const known = new Set(tableNames(db));
    for (const [table, rows] of Object.entries(backup.tables)) {
      if (!known.has(table) || !Array.isArray(rows)) continue;
      const cols = columns(db, table);
      const insert = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
      for (const row of rows) {
        insert.run(cols.map((col) => (row as Record<string, unknown>)[col] ?? null));
      }
      insert.free();
    }
    if (memory) memory.close();
    attach(db);
    rowHashes.clear();
    const nextRevision = memoryRevision + 1;
    await persistToPostgres(client, nextRevision);
    await client.query(
      `INSERT INTO audit_events (user_id, email, action, summary) VALUES ($1, $2, $3, $4)`,
      [actor.id, actor.email, 'restore', 'Restored a PostgreSQL backup'],
    );
    await client.query('COMMIT');
    return { revision: memoryRevision, snapshot: productionSnapshot() };
  } catch (error) {
    await client.query('ROLLBACK');
    await initProductionEngine();
    const message = error instanceof Error ? error.message : 'The backup could not be restored.';
    throw new Error(redactDatabaseUrl(message));
  } finally {
    client.release();
  }
}

export async function clearProductionData(actor: Actor): Promise<{ revision: number; snapshot: string }> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [841_234]);
    const meta = await client.query('SELECT revision FROM production_meta WHERE id = 1 FOR UPDATE');
    const sql = await sqlModule();
    const db = new sql.Database();
    db.run('PRAGMA foreign_keys = OFF');
    db.run(SCHEMA);
    if (memory) memory.close();
    attach(db);
    rowHashes.clear();
    memoryRevision = Number(meta.rows[0]?.revision ?? 0);
    await reloadStructure(client);
    const nextRevision = memoryRevision + 1;
    await persistToPostgres(client, nextRevision);
    await client.query(
      `INSERT INTO audit_events (user_id, email, action, summary) VALUES ($1, $2, $3, $4)`,
      [actor.id, actor.email, 'clear', 'Cleared production records'],
    );
    await client.query('COMMIT');
    return { revision: memoryRevision, snapshot: productionSnapshot() };
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Production records could not be cleared.';
    throw new Error(redactDatabaseUrl(message));
  } finally {
    client.release();
  }
}

async function reloadStructure(client: import('pg').PoolClient): Promise<void> {
  const categories = await client.query('SELECT name FROM inventory_categories ORDER BY id');
  const plans = await client.query('SELECT id, name, width_ft, height_ft, notes FROM floor_plans ORDER BY id');
  if (!memory) return;
  for (const row of categories.rows) {
    memory.run('INSERT INTO inventory_categories (name) VALUES (?)', [row.name]);
  }
  for (const row of plans.rows) {
    memory.run(
      'INSERT INTO floor_plans (id, name, width_ft, height_ft, notes) VALUES (?, ?, ?, ?, ?)',
      [row.id, row.name, row.width_ft, row.height_ft, row.notes],
    );
  }
}

export async function archiveOldAuditEvents(now = new Date()): Promise<number> {
  const cutoff = auditArchiveCutoff(now);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(ARCHIVE_OLD_AUDIT_INSERT, [cutoff]);
    const deleted = await client.query(ARCHIVE_OLD_AUDIT_DELETE, [cutoff]);
    await client.query('COMMIT');
    return deleted.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'The audit log could not be archived.';
    throw new Error(redactDatabaseUrl(message));
  } finally {
    client.release();
  }
}

export async function listAuditEvents(limit = 100, now = new Date()): Promise<AuditEventRow[]> {
  await archiveOldAuditEvents(now);
  const cutoff = auditArchiveCutoff(now);
  const result = await getPool().query(
    `SELECT id, email, action, summary, created_at
     FROM audit_events
     WHERE created_at >= $1
     ORDER BY id DESC
     LIMIT $2`,
    [cutoff, Math.min(Math.max(limit, 1), 200)],
  );
  return result.rows;
}

export async function listArchivedAuditEvents(limit = 100): Promise<AuditEventRow[]> {
  const result = await getPool().query(
    `SELECT id, email, action, summary, created_at
     FROM audit_events_archive
     ORDER BY id DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return result.rows;
}

export async function resetProductionEngineForTests(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO distillery');
  } finally {
    client.release();
  }
  if (memory) {
    memory.close();
    memory = null;
  }
  memoryRevision = -1;
  rowHashes.clear();
}
