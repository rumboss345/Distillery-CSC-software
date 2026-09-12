import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { query } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

const MIGRATION_LOCK_KEY = 847291003;

export async function runMigrations(): Promise<string[]> {
  await query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename');
    const appliedSet = new Set(applied.rows.map((r) => r.filename));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const newlyApplied: string[] = [];

    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      await query(sql);
      await query(
        'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        [file],
      );
      newlyApplied.push(file);
      console.log(`Applied migration: ${file}`);
    }

    return newlyApplied;
  } finally {
    await query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
}
