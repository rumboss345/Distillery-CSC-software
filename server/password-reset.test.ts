import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashResetToken } from './password-reset';

const ORIGINAL_PASSWORD = 'EmployeePass1';
const NEW_PASSWORD = 'Replacement9';

describe('password reset email', () => {
  it('keeps the reset link out of production logs when SMTP is not configured', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousHost = process.env.SMTP_HOST;
    process.env.NODE_ENV = 'production';
    delete process.env.SMTP_HOST;
    const lines: string[] = [];
    const warn = console.warn;
    const log = console.log;
    console.warn = (message?: unknown) => {
      lines.push(String(message));
    };
    console.log = (message?: unknown) => {
      lines.push(String(message));
    };
    try {
      const email = await import('./email.ts');
      const result = await email.sendPasswordResetEmail({
        to: 'casey.lee@csc.test',
        token: 'secret-token-value',
      });
      expect(result.sent).toBe(false);
      expect(lines.join('\n')).not.toContain('secret-token-value');
    } finally {
      console.warn = warn;
      console.log = log;
      process.env.NODE_ENV = previousNodeEnv;
      if (previousHost === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = previousHost;
    }
  });
});

describe('sqlite password reset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csc-password-reset-'));
  let auth: typeof import('./auth-sqlite.ts');

  beforeAll(async () => {
    process.env.DATA_DIR = dir;
    delete process.env.DATABASE_URL;
    auth = await import('./auth-sqlite.ts');
    auth.initializeAuthDatabase();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lets an approved employee choose a new password and rejects a used or expired link', () => {
    const employee = auth.createUserByAdmin('casey.lee@csc.test', ORIGINAL_PASSWORD, 'Casey Lee', ['inventory'], ['fermentation']);
    const pendingHash = bcrypt.hashSync('PendingPass1', 4);
    auth.createUser('pending.person@csc.test', pendingHash, 'Pending');

    expect(auth.createPasswordResetToken('missing@csc.test')).toBeNull();
    expect(auth.createPasswordResetToken('pending.person@csc.test')).toBeNull();

    const token = auth.createPasswordResetToken(employee.email);
    expect(token).toBeTruthy();
    const storedDb = new Database(join(dir, 'auth.db'));
    const stored = storedDb
      .prepare('SELECT token_hash FROM password_reset_tokens WHERE user_id = ?')
      .get(employee.id) as { token_hash: string };
    storedDb.close();
    expect(stored.token_hash).toBe(hashResetToken(token!));
    expect(stored.token_hash).not.toBe(token);

    expect(auth.resetPasswordWithToken(token!, NEW_PASSWORD)).toBe(true);
    expect(auth.resetPasswordWithToken(token!, NEW_PASSWORD)).toBe(false);
    const updated = auth.getUserByEmail(employee.email)!;
    expect(bcrypt.compareSync(NEW_PASSWORD, updated.password_hash)).toBe(true);
    expect(bcrypt.compareSync(ORIGINAL_PASSWORD, updated.password_hash)).toBe(false);

    const expired = auth.createPasswordResetToken(employee.email)!;
    const expireDb = new Database(join(dir, 'auth.db'));
    expireDb.prepare(`UPDATE password_reset_tokens SET expires_at = '2000-01-01T00:00:00.000Z'`).run();
    expireDb.close();
    expect(auth.resetPasswordWithToken(expired, 'AnotherPass1')).toBe(false);

    expect(auth.changePassword(employee.id, 'wrong-password', 'AnotherPass1')).toEqual({
      ok: false,
      error: 'Current password is incorrect',
    });
    expect(auth.changePassword(employee.id, NEW_PASSWORD, 'AnotherPass1')).toEqual({ ok: true });
    expect(bcrypt.compareSync('AnotherPass1', auth.getUserByEmail(employee.email)!.password_hash)).toBe(true);

    const replacement = auth.createPasswordResetToken(employee.email);
    expect(replacement).toBeTruthy();
    const saved = auth.updateUserByAdmin(employee.id, { password: 'AdminSetPass1' });
    expect(saved?.email).toBe(employee.email);
    expect(auth.resetPasswordWithToken(replacement!, 'ShouldNotWork1')).toBe(false);
    expect(bcrypt.compareSync('AdminSetPass1', auth.getUserByEmail(employee.email)!.password_hash)).toBe(true);
  });

  it('lets an administrator reset another administrator password and remove that account', () => {
    const other = auth.createUserByAdmin(
      'other.admin@csc.test',
      ORIGINAL_PASSWORD,
      'Other Admin',
      [],
      [],
      'admin',
    );
    const before = auth.getUserPermissions(other.id);
    const saved = auth.updateUserByAdmin(other.id, {
      password: 'OtherAdmin9',
      permissions: ['inventory'],
    });
    expect(saved?.role).toBe('admin');
    expect(bcrypt.compareSync('OtherAdmin9', auth.getUserById(other.id)!.password_hash)).toBe(true);
    expect(auth.getUserPermissions(other.id)).toEqual(before);

    const previous = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = other.email;
    expect(auth.publicUser(auth.getUserById(other.id)!).restoredFromSettings).toBe(true);
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
    expect(auth.publicUser(auth.getUserById(other.id)!).restoredFromSettings).toBe(false);

    expect(auth.deleteUserById(other.id)).toEqual({ ok: true });
    expect(auth.getUserById(other.id)).toBeUndefined();
  });
});

describe('postgres password reset', () => {
  const databaseUrl = 'postgres://distillery:distillery@127.0.0.1:5432/distillery_pg_password';
  let auth: typeof import('./auth-pg.ts');
  let migrate: typeof import('./migrate.ts');
  let pg: typeof import('./pg.ts');

  beforeAll(async () => {
    execSync(
      `sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS distillery_pg_password;" -c "CREATE DATABASE distillery_pg_password OWNER distillery;"`,
    );
    process.env.DATABASE_URL = databaseUrl;
    migrate = await import('./migrate.ts');
    pg = await import('./pg.ts');
    auth = await import('./auth-pg.ts');
    await migrate.migrateDatabase();
    await migrate.migrateDatabase();
  });

  afterAll(async () => {
    if (pg) await pg.closePool();
    execSync(`sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS distillery_pg_password;"`);
    delete process.env.DATABASE_URL;
  });

  it('stores reset links in PostgreSQL and applies migration 002 once', async () => {
    const versions = await pg.getPool().query(`SELECT version FROM schema_migrations ORDER BY version`);
    expect(versions.rows.map((row) => row.version)).toEqual(['001', '002']);
    const employee = await auth.createUserByAdmin(
      'casey.lee@csc.test',
      ORIGINAL_PASSWORD,
      'Casey Lee',
      ['inventory'],
      ['fermentation'],
    );
    const token = await auth.createPasswordResetToken(employee.email);
    expect(token).toBeTruthy();
    const stored = await pg.getPool().query('SELECT token_hash FROM password_reset_tokens WHERE user_id = $1', [employee.id]);
    expect(stored.rows[0].token_hash).toBe(hashResetToken(token!));

    expect(await auth.resetPasswordWithToken(token!, NEW_PASSWORD)).toBe(true);
    expect(await auth.resetPasswordWithToken(token!, NEW_PASSWORD)).toBe(false);
    const updated = (await auth.getUserByEmail(employee.email))!;
    expect(bcrypt.compareSync(NEW_PASSWORD, updated.password_hash)).toBe(true);

    expect(await auth.changePassword(employee.id, NEW_PASSWORD, 'ChangedPass1')).toEqual({ ok: true });
    const sample = await pg.getPool().query(
      `SELECT count(*)::int AS count FROM mash_batches WHERE batch_number = 'M-2025-001'`,
    );
    expect(sample.rows[0].count).toBe(0);
  });

  it('lets an administrator reset another administrator password and remove that account', async () => {
    const other = await auth.createUserByAdmin(
      'other.admin@csc.test',
      ORIGINAL_PASSWORD,
      'Other Admin',
      [],
      [],
      'admin',
    );
    const before = await auth.getUserPermissions(other.id);
    const saved = await auth.updateUserByAdmin(other.id, {
      password: 'OtherAdmin9',
      permissions: ['inventory'],
    });
    expect(saved?.role).toBe('admin');
    const stored = (await auth.getUserById(other.id))!;
    expect(bcrypt.compareSync('OtherAdmin9', stored.password_hash)).toBe(true);
    expect(await auth.getUserPermissions(other.id)).toEqual(before);
    expect(await auth.deleteUserById(other.id)).toEqual({ ok: true });
    expect(await auth.getUserById(other.id)).toBeUndefined();
  });
});
