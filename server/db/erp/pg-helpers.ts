import type pg from 'pg';
import { formatBusinessCode, codePrefixForEntity, type CodeEntityType } from '../../../shared/master-data/codes.js';
import { getPool, query as poolQuery } from '../pool.js';

type Queryable = pg.Pool | pg.PoolClient;

function resolveQueryable(client?: pg.PoolClient): Queryable {
  return client ?? getPool();
}

export async function queryAll<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: pg.PoolClient,
): Promise<T[]> {
  const result = await resolveQueryable(client).query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: pg.PoolClient,
): Promise<T | null> {
  const rows = await queryAll<T>(text, params, client);
  return rows[0] ?? null;
}

export async function insertRow(
  text: string,
  params: unknown[] = [],
  client?: pg.PoolClient,
): Promise<number> {
  const returningSql = text.trimEnd().endsWith('RETURNING id')
    ? text
    : `${text.trimEnd().replace(/;$/, '')} RETURNING id`;
  const row = await queryOne<{ id: number }>(returningSql, params, client);
  if (!row) throw new Error('Insert did not return an id.');
  return row.id;
}

export async function runQuery(
  text: string,
  params: unknown[] = [],
  client?: pg.PoolClient,
): Promise<void> {
  await resolveQueryable(client).query(text, params);
}

export async function withPgTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Concurrency-safe business code generation using pg_advisory_xact_lock. */
export async function nextBusinessCode(
  entityType: CodeEntityType,
  table: string,
  codeColumn: string,
  pad = 4,
  client?: pg.PoolClient,
): Promise<string> {
  const execute = async (c: pg.PoolClient): Promise<string> => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [entityType]);
    const prefix = codePrefixForEntity(entityType);
    const row = await queryOne<{ last_number: number }>(
      'SELECT last_number FROM md_code_sequences WHERE entity_type = $1',
      [entityType],
      c,
    );
    let next = (row?.last_number ?? 0) + 1;
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = formatBusinessCode(prefix, next, pad);
      const clash = await queryOne<{ id: number }>(
        `SELECT id FROM ${table} WHERE ${codeColumn} = $1`,
        [code],
        c,
      );
      if (!clash) {
        if (row) {
          await runQuery(
            'UPDATE md_code_sequences SET last_number = $1 WHERE entity_type = $2',
            [next, entityType],
            c,
          );
        } else {
          await runQuery(
            'INSERT INTO md_code_sequences (entity_type, last_number) VALUES ($1, $2)',
            [entityType, next],
            c,
          );
        }
        return code;
      }
      next++;
    }
    throw new Error('Could not generate a unique business code.');
  };

  if (client) return execute(client);
  return withPgTransaction(execute);
}

/** Re-export pool query for modules that only need read access outside transactions. */
export { poolQuery as query };
