import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/** Render's external URL requires SSL. The internal URL used by the web service does not. */
export function postgresSsl(connectionString: string): { rejectUnauthorized: false } | undefined {
  if (/sslmode=disable/i.test(connectionString)) return undefined;
  const needsSsl = /sslmode=require/i.test(connectionString) || /\.render\.com\b/i.test(connectionString);
  return needsSsl ? { rejectUnauthorized: false } : undefined;
}

export function redactDatabaseUrl(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://***');
}

export function usingPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: postgresSsl(connectionString),
      max: 10,
      statement_timeout: 20000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (error) => {
      console.error(`PostgreSQL pool error: ${redactDatabaseUrl(error.message)}`);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
