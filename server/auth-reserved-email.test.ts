import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const LOCAL_URL = 'postgres://distillery:distillery@127.0.0.1:5432/distillery_pg_test';

describe('reserved auth emails', () => {
  let auth: typeof import('./auth-pg');

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', LOCAL_URL);
    vi.stubEnv('ADMIN_EMAIL', 'admin-reserved@csc.test');
    vi.stubEnv('ADMIN_PASSWORD', 'Admin-Reserved-1');
    vi.stubEnv('OWNER_EMAIL', 'owner-reserved@csc.test');
    const migrate = await import('./migrate');
    await migrate.migrateDatabase();
    auth = await import('./auth-pg');
    await auth.initializeAuthDatabase();
  });

  afterEach(async () => {
    const pg = await import('./pg');
    await pg.closePool();
    vi.unstubAllEnvs();
    delete process.env.DATABASE_URL;
  });

  it('refuses public registration for owner and admin env emails', async () => {
    const hash = bcrypt.hashSync('Staff-Pass-1', 12);
    await expect(auth.createUser('owner-reserved@csc.test', hash, 'Intruder')).rejects.toThrow(/reserved/i);
    await expect(auth.createUser('admin-reserved@csc.test', hash, 'Intruder')).rejects.toThrow(/reserved/i);
    const staff = await auth.createUser('staff-reserved@csc.test', hash, 'Staff');
    expect(staff.status).toBe('pending');
    expect(staff.role).toBe('user');
  });

  it('skips owner promotion when no owner email is configured', async () => {
    vi.stubEnv('OWNER_EMAIL', '');
    vi.stubEnv('ADMIN_EMAIL', '');
    await expect(auth.promoteSiteOwner()).resolves.toBeUndefined();
  });
});
