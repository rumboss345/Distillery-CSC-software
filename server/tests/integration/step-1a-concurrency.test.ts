/**
 * Step 1A multi-user concurrency — document sequence uniqueness (requires DATABASE_URL).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { closePool, withTransaction } from '../../db/pool.js';
import { runMigrations } from '../../db/migrate.js';
import { nextBusinessCode } from '../../db/erp/pg-helpers.js';

const pgConfigured = Boolean(process.env.DATABASE_URL);

describe('Step 1A concurrency', { skip: !pgConfigured }, () => {
  before(async () => {
    await runMigrations();
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO md_code_sequences (entity_type, last_number) VALUES ('materialTransaction', 0)
         ON CONFLICT (entity_type) DO UPDATE SET last_number = 0`,
      );
    });
  });

  after(async () => {
    await closePool();
  });

  it('generates unique document codes under concurrent transactions', async () => {
    const codes = await Promise.all(
      Array.from({ length: 8 }, () =>
        withTransaction((client) =>
          nextBusinessCode('materialTransaction', 'mat_transactions', 'transaction_code', 6, client),
        ),
      ),
    );
    const unique = new Set(codes);
    assert.equal(unique.size, codes.length, `Duplicate codes: ${codes.join(', ')}`);
  });
});
