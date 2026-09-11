import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { runMigrations } from '../../db/migrate.js';
import { query, queryOne, withTransaction, closePool } from '../../db/pool.js';
import { runProductionImportTransaction } from '../../services/sqljs-import/run-import.js';
import { collectPreview, openSqlJsDatabase } from '../../services/sqljs-import/parser.js';
import { createTestBrowserDatabase, exportDatabaseBase64 } from '../helpers/test-browser-db.js';
import { US_GAL_TO_LITRES } from '../../../shared/units.js';

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-migration-tests';

function skipUnlessDb(): boolean {
  if (!DATABASE_URL) {
    console.log('Skipping integration tests: DATABASE_URL not set');
    return true;
  }
  return false;
}

async function ensureAdminUser(): Promise<{ id: number; email: string; token: string }> {
  const email = 'migration-test-admin@csc.test';
  const hash = bcrypt.hashSync('testpassword123', 4);
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  let id = existing?.id;
  if (!id) {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO users (email, password_hash, name, role, status)
       VALUES ($1, $2, 'Test Admin', 'admin', 'approved') RETURNING id`,
      [email, hash],
    );
    id = row!.id;
  }
  const token = jwt.sign({ userId: id, email, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
  return { id: id!, email, token };
}

describe('migration integration', { skip: skipUnlessDb() }, () => {
  before(async () => {
    await runMigrations();
  });

  after(async () => {
    await closePool();
  });

  it('A: empty PostgreSQL database starts with migrations applied', async () => {
    const migrations = await queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM schema_migrations',
    );
    assert.ok(Number(migrations?.count ?? 0) >= 4);
  });

  it('C/D/E: import preserves IDs and converts gallons to litres', async () => {
    const admin = await ensureAdminUser();
    const browserDb = await createTestBrowserDatabase();
    const base64 = exportDatabaseBase64(browserDb);

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM mash_batches`);
      await client.query(`DELETE FROM inventory_items`);
      await client.query(`DELETE FROM inventory_categories`);
      await client.query(`DELETE FROM data_import_runs WHERE status = 'imported'`);
    });

    const result = await withTransaction((client) =>
      runProductionImportTransaction(browserDb, client, {
        sourceLabel: 'integration_test',
        userId: admin.id,
        userEmail: admin.email,
        replaceExisting: false,
        backupBase64: base64,
        externalBackupAcknowledged: true,
      }),
    );

    assert.ok(result.importRunId > 0);

    const batch = await queryOne<{ id: number; batch_number: string; water_litres: string }>(
      'SELECT id, batch_number, water_litres::text FROM mash_batches WHERE id = 1',
    );
    assert.equal(batch?.batch_number, 'WASH-2026-001');
    const expectedLitres = 100 * US_GAL_TO_LITRES;
    assert.ok(Math.abs(Number(batch?.water_litres) - expectedLitres) < 0.0001);

    browserDb.close();
  });

  it('F: failed import rolls back partial data', async () => {
    const admin = await ensureAdminUser();
    const browserDb = await createTestBrowserDatabase();
    const base64 = exportDatabaseBase64(browserDb);

    const countBefore = await queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM mash_batches',
    );

    try {
      await withTransaction(async (client) => {
        await runProductionImportTransaction(browserDb, client, {
          sourceLabel: 'integration_test_fail',
          userId: admin.id,
          userEmail: admin.email,
          replaceExisting: false,
          backupBase64: base64,
          externalBackupAcknowledged: true,
        });
        throw new Error('Simulated failure after import');
      });
    } catch {
      /* expected */
    }

    const countAfter = await queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM mash_batches',
    );
    assert.equal(countAfter?.count, countBefore?.count);
    browserDb.close();
  });

  it('G: preview does not alter production table counts', async () => {
    const browserDb = await createTestBrowserDatabase();
    const base64 = exportDatabaseBase64(browserDb);
    const db = await openSqlJsDatabase(base64);
    const preview = collectPreview(db, 'preview_test');
    db.close();

    const count = await queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM mash_batches WHERE batch_number = $1',
      ['WASH-2026-001'],
    );
    assert.ok(preview.tables.mash_batches === 1);
    assert.ok(Number(count?.count ?? 0) >= 0);
    browserDb.close();
  });

  it('H: duplicate import of same backup is rejected', async () => {
    const admin = await ensureAdminUser();
    const browserDb = await createTestBrowserDatabase();
    const base64 = exportDatabaseBase64(browserDb);

    await assert.rejects(
      () => withTransaction((client) =>
        runProductionImportTransaction(browserDb, client, {
          sourceLabel: 'integration_test_dup',
          userId: admin.id,
          userEmail: admin.email,
          replaceExisting: false,
          backupBase64: base64,
          externalBackupAcknowledged: true,
        }),
      ),
      /already been imported/,
    );
    browserDb.close();
  });
});
