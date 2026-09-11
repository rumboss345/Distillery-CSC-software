import { isDatabaseConfigured } from './config.js';
import { migrateAuthFromSqliteIfNeeded, syncAdminFromEnv } from './db/auth.js';
import { runMigrations } from './db/migrate.js';
import { pingDatabase } from './db/pool.js';

export async function initializeServerDatastores(): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.warn(
      'DATABASE_URL is not set. Auth and production APIs require PostgreSQL. ' +
      'Use docker-compose up -d for local development or attach Render Postgres in production.',
    );
    return;
  }

  const connected = await pingDatabase();
  if (!connected) {
    console.error('Could not connect to PostgreSQL. Check DATABASE_URL.');
    process.exit(1);
  }

  const applied = await runMigrations();
  if (applied.length > 0) {
    console.log(`Applied ${applied.length} database migration(s).`);
  }

  const authMigration = await migrateAuthFromSqliteIfNeeded();
  console.log(`Auth migration: ${authMigration.message}`);
  await syncAdminFromEnv();
}
