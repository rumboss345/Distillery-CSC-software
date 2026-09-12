import type pg from 'pg';
import { queryAll } from '../pg-helpers.js';
import { ALLOWLISTED_ERP_TABLES } from './allowlist.js';

/** Export all allowlisted ERP tables as table name → row arrays (bootstrap / sync). */
export async function exportAllErpTables(
  client?: pg.PoolClient,
): Promise<Record<string, Record<string, unknown>[]>> {
  const result: Record<string, Record<string, unknown>[]> = {};

  for (const table of ALLOWLISTED_ERP_TABLES) {
    try {
      const rows = await queryAll<Record<string, unknown>>(
        `SELECT * FROM ${table}`,
        [],
        client,
      );
      result[table] = rows;
    } catch {
      result[table] = [];
    }
  }

  return result;
}
