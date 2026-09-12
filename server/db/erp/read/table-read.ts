import { queryAll } from '../pg-helpers.js';
import { isAllowlistedErpTable } from './allowlist.js';

const SAFE_COLUMN = /^[a-z_][a-z0-9_]*$/i;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

export interface TableReadOptions {
  filters?: Record<string, string | number | boolean>;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export async function readAllowlistedTable(
  table: string,
  options: TableReadOptions = {},
): Promise<Record<string, unknown>[]> {
  if (!isAllowlistedErpTable(table)) {
    throw new Error(`Table "${table}" is not allowlisted for read access.`);
  }

  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  for (const [column, value] of Object.entries(options.filters ?? {})) {
    if (!SAFE_COLUMN.test(column)) {
      throw new Error(`Invalid filter column: ${column}`);
    }
    clauses.push(`${column} = $${paramIdx++}`);
    params.push(value);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  let orderClause = '';
  if (options.orderBy) {
    if (!SAFE_COLUMN.test(options.orderBy)) {
      throw new Error(`Invalid order column: ${options.orderBy}`);
    }
    const dir = options.orderDir === 'desc' ? 'DESC' : 'ASC';
    orderClause = ` ORDER BY ${options.orderBy} ${dir}`;
  }

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(options.offset ?? 0, 0);

  return queryAll<Record<string, unknown>>(
    `SELECT * FROM ${table} ${where}${orderClause} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset],
  );
}
