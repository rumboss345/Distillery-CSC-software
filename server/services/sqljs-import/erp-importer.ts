/**
 * Generic ERP table importer — copies browser sql.js rows into PostgreSQL preserving IDs.
 */
import type { Database } from 'sql.js';
import type pg from 'pg';
import { selectAll, tableExists } from './parser.js';
import { ERP_IMPORT_TABLES, erpTablesInDeleteOrder } from './erp-table-registry.js';
import type { TableCounts } from './types.js';

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function coerceValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

async function getPgColumns(client: pg.PoolClient, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((r) => r.column_name);
}

async function tableExistsPg(client: pg.PoolClient, table: string): Promise<boolean> {
  const row = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table],
  );
  return Boolean(row.rows[0]?.exists);
}

async function resetSequence(client: pg.PoolClient, table: string): Promise<void> {
  const seq = await client.query<{ seq: string | null }>(
    `SELECT pg_get_serial_sequence($1, 'id') AS seq`,
    [table],
  );
  const seqName = seq.rows[0]?.seq;
  if (seqName) {
    await client.query(
      `SELECT setval($1, (SELECT COALESCE(MAX(id), 1) FROM ${table}))`,
      [seqName],
    );
  }
}

async function importTableGeneric(
  browserDb: Database,
  client: pg.PoolClient,
  table: string,
  noSerialId: boolean,
  importRunId?: number,
): Promise<number> {
  if (!tableExists(browserDb, table)) return 0;
  if (!(await tableExistsPg(client, table))) return 0;

  const pgColumns = await getPgColumns(client, table);
  if (!pgColumns.length) return 0;

  const rows = selectAll(browserDb, table);
  if (!rows.length) return 0;

  await client.query(`DELETE FROM ${table}`);

  let imported = 0;
  for (const row of rows) {
    const insertCols: string[] = [];
    const values: unknown[] = [];

    for (const col of pgColumns) {
      if (col === 'import_run_id' && importRunId != null) {
        insertCols.push(col);
        values.push(importRunId);
        continue;
      }
      if (!(col in row) && col !== 'import_run_id') continue;
      if (col in row) {
        insertCols.push(col);
        values.push(coerceValue(row[col]));
      }
    }

    if (!insertCols.length) continue;

    const hasId = insertCols.includes('id') && row.id != null;
    if (noSerialId || !hasId) {
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders})
         ON CONFLICT DO NOTHING`,
        values,
      );
    } else {
      const id = num(row.id);
      const colsWithoutId: string[] = [];
      const valsWithoutId: unknown[] = [];
      for (let i = 0; i < insertCols.length; i++) {
        if (insertCols[i] === 'id') continue;
        colsWithoutId.push(insertCols[i]);
        valsWithoutId.push(values[i]);
      }
      const placeholders = valsWithoutId.map((_, i) => `$${i + 2}`).join(', ');
      await client.query(
        `INSERT INTO ${table} (id, ${colsWithoutId.join(', ')})
         OVERRIDING SYSTEM VALUE VALUES ($1, ${placeholders})
         ON CONFLICT (id) DO NOTHING`,
        [id, ...valsWithoutId],
      );
    }
    imported += 1;
  }

  if (!noSerialId) {
    await resetSequence(client, table);
  }
  return imported;
}

export async function clearErpTables(client: pg.PoolClient): Promise<void> {
  for (const table of erpTablesInDeleteOrder()) {
    if (await tableExistsPg(client, table)) {
      await client.query(`DELETE FROM ${table}`);
    }
  }
}

export async function importErpTablesFromSqlJs(
  browserDb: Database,
  client: pg.PoolClient,
  importRunId?: number,
  options?: { skipLegacy?: boolean },
): Promise<TableCounts> {
  const counts: TableCounts = {};

  for (const spec of ERP_IMPORT_TABLES) {
    if (options?.skipLegacy && ['inventory_categories', 'inventory_items', 'floor_plans', 'floor_equipment'].includes(spec.table)) {
      continue;
    }
    const count = await importTableGeneric(
      browserDb,
      client,
      spec.table,
      Boolean(spec.noSerialId),
      importRunId,
    );
    if (count > 0) counts[spec.table] = count;
  }

  return counts;
}
