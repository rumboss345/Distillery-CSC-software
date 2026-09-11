import type { Database, SqlValue } from 'sql.js/dist/sql-wasm.js';
import { isPostgresAuthoritativeMode } from '../db/production-mode';
import { getBootstrapCache, isBootstrapLoaded } from './server-cache';
import { ERP_OPERATIONAL_TABLES, isErpOperationalTable } from './erp-table-registry';

let hydratedFromServer = false;

export function isErpHydratedFromServer(): boolean {
  return hydratedFromServer && isBootstrapLoaded();
}

export function clearHydrationState(): void {
  hydratedFromServer = false;
}

/** Detect ERP table references in SQL. */
export function extractErpTablesFromSql(sql: string): string[] {
  const found = new Set<string>();
  const normalized = sql.replace(/\s+/g, ' ');
  const fromMatches = normalized.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi);
  for (const match of fromMatches) {
    const table = match[1].toLowerCase();
    if (isErpOperationalTable(table)) found.add(table);
  }
  return [...found];
}

export function shouldBlockLocalErpRead(sql: string): boolean {
  if (!isPostgresAuthoritativeMode()) return false;
  if (!isBootstrapLoaded()) return extractErpTablesFromSql(sql).length > 0;
  return false;
}

/**
 * Replace ERP table contents in the in-memory sql.js database with server bootstrap data.
 * After hydration, existing repository SQL runs against server-sourced rows — not localStorage ERP data.
 */
export function hydrateErpTablesFromServerCache(db: Database): void {
  if (!isPostgresAuthoritativeMode()) return;
  const cache = getBootstrapCache();
  if (!cache) {
    throw new Error('ERP server cache is not loaded. Wait for bootstrap before reading operational data.');
  }

  db.run('BEGIN');
  try {
    for (const table of ERP_OPERATIONAL_TABLES) {
      try {
        db.run(`DELETE FROM ${table}`);
      } catch {
        /* table may not exist in legacy schema slice */
      }
    }

    for (const [table, rows] of Object.entries(cache.tables)) {
      if (!isErpOperationalTable(table) || rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      if (columns.length === 0) continue;
      const placeholders = columns.map(() => '?').join(', ');
      const colList = columns.join(', ');
      for (const row of rows) {
        const values = columns.map((col) => {
          const v = row[col];
          if (v === null || v === undefined) return null;
          if (typeof v === 'object') return JSON.stringify(v);
          return v as SqlValue;
        });
        try {
          db.run(`INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${placeholders})`, values);
        } catch {
          /* column mismatch — skip row */
        }
      }
    }
    db.run('COMMIT');
    hydratedFromServer = true;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}
