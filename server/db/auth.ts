import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import Database from 'better-sqlite3';
import { copyFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { query, queryOne, withTransaction } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEGACY_AUTH_DB = join(__dirname, '..', 'data', 'auth.db');

export type UserRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  approval_token: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthMigrationResult {
  status: 'completed' | 'skipped' | 'failed' | 'no_legacy_db';
  usersFound: number;
  usersImported: number;
  legacyBackupPath: string | null;
  message: string;
}

export async function migrateAuthFromSqliteIfNeeded(): Promise<AuthMigrationResult> {
  const prior = await queryOne<{ status: string }>(
    `SELECT status FROM auth_migration_audit WHERE status = 'completed' ORDER BY id DESC LIMIT 1`,
  );
  if (prior) {
    return {
      status: 'skipped',
      usersFound: 0,
      usersImported: 0,
      legacyBackupPath: null,
      message: 'Auth migration already completed (idempotent skip).',
    };
  }

  const pgCount = await queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
  if (Number(pgCount?.count ?? 0) > 0) {
    await query(
      `INSERT INTO auth_migration_audit (status, users_found, users_imported, completed_at, error_message)
       VALUES ('skipped', 0, $1, NOW(), 'PostgreSQL users table already populated')`,
      [Number(pgCount.count)],
    );
    return {
      status: 'skipped',
      usersFound: Number(pgCount.count),
      usersImported: Number(pgCount.count),
      legacyBackupPath: null,
      message: 'PostgreSQL already has users; legacy auth.db was not imported.',
    };
  }

  if (!existsSync(LEGACY_AUTH_DB)) {
    return {
      status: 'no_legacy_db',
      usersFound: 0,
      usersImported: 0,
      legacyBackupPath: null,
      message: 'No legacy auth.db found; PostgreSQL auth will be seeded from environment only.',
    };
  }

  const backupPath = `${LEGACY_AUTH_DB}.preserved-${Date.now()}`;
  copyFileSync(LEGACY_AUTH_DB, backupPath);

  const sqlite = new Database(LEGACY_AUTH_DB, { readonly: true });
  const rows = sqlite.prepare('SELECT * FROM users ORDER BY id').all() as Array<{
    id: number;
    email: string;
    password_hash: string;
    name: string | null;
    role: UserRole;
    status: UserStatus;
    approval_token: string | null;
    created_at: string;
  }>;
  sqlite.close();

  console.log(`Auth migration: found ${rows.length} user(s) in legacy auth.db (preserved at ${backupPath}).`);

  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO auth_migration_audit (status, legacy_auth_path, legacy_backup_path, users_found)
         VALUES ('started', $1, $2, $3)`,
        [LEGACY_AUTH_DB, backupPath, rows.length],
      );

      for (const row of rows) {
        await client.query(
          `INSERT INTO users (id, email, password_hash, name, role, status, approval_token, created_at, updated_at)
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $8::timestamptz)`,
          [row.id, row.email, row.password_hash, row.name, row.role, row.status, row.approval_token, row.created_at],
        );
      }

      if (rows.length > 0) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users))`,
        );
      }

      const verify = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
      const imported = Number(verify.rows[0]?.count ?? 0);
      if (imported < rows.length) {
        throw new Error(`Auth import validation failed: expected ${rows.length}, got ${imported}`);
      }

      await client.query(
        `INSERT INTO auth_migration_audit (status, legacy_auth_path, legacy_backup_path, users_found, users_imported, completed_at)
         VALUES ('completed', $1, $2, $3, $4, NOW())`,
        [LEGACY_AUTH_DB, backupPath, rows.length, imported],
      );
    });
  } catch (err) {
    await query(
      `INSERT INTO auth_migration_audit (status, legacy_auth_path, legacy_backup_path, users_found, users_imported, error_message, completed_at)
       VALUES ('failed', $1, $2, $3, 0, $4, NOW())`,
      [LEGACY_AUTH_DB, backupPath, rows.length, err instanceof Error ? err.message : 'Auth migration failed'],
    );
    throw err;
  }

  console.log(`Migrated ${rows.length} auth user(s) to PostgreSQL. Legacy auth.db preserved (not deleted).`);
  return {
    status: 'completed',
    usersFound: rows.length,
    usersImported: rows.length,
    legacyBackupPath: backupPath,
    message: `Imported ${rows.length} user(s) from legacy auth.db.`,
  };
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const row = await queryOne<User>(
    'SELECT * FROM users WHERE lower(email) = lower($1) AND is_active = TRUE',
    [email],
  );
  return row ?? undefined;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const row = await queryOne<User>('SELECT * FROM users WHERE id = $1 AND is_active = TRUE', [id]);
  return row ?? undefined;
}

export async function getUserByApprovalToken(token: string): Promise<User | undefined> {
  const row = await queryOne<User>('SELECT * FROM users WHERE approval_token = $1', [token]);
  return row ?? undefined;
}

export async function createUser(email: string, passwordHash: string, name: string | null): Promise<User> {
  const token = randomBytes(32).toString('hex');
  const row = await queryOne<User>(
    `INSERT INTO users (email, password_hash, name, role, status, approval_token)
     VALUES ($1, $2, $3, 'user', 'pending', $4)
     RETURNING *`,
    [email.toLowerCase(), passwordHash, name, token],
  );
  return row!;
}

export async function approveUserByToken(token: string): Promise<User | null> {
  const user = await getUserByApprovalToken(token);
  if (!user || user.status !== 'pending') return null;
  return queryOne<User>(
    `UPDATE users SET status = 'approved', approval_token = NULL, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [user.id],
  );
}

export async function approveUserById(id: number): Promise<User | null> {
  const user = await getUserById(id);
  if (!user || user.role === 'admin' || user.status !== 'pending') return null;
  return queryOne<User>(
    `UPDATE users SET status = 'approved', approval_token = NULL, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id],
  );
}

export async function rejectUserById(id: number): Promise<User | null> {
  const user = await getUserById(id);
  if (!user || user.role === 'admin' || user.status !== 'pending') return null;
  return queryOne<User>(
    `UPDATE users SET status = 'rejected', approval_token = NULL, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id],
  );
}

export async function listPendingUsers() {
  const result = await query<Omit<User, 'password_hash' | 'approval_token'>>(
    `SELECT id, email, name, role, status, is_active, created_at, updated_at FROM users
     WHERE status = 'pending' AND role = 'user' AND is_active = TRUE
     ORDER BY created_at ASC`,
  );
  return result.rows;
}

export async function resetAdminAccount(email: string, password: string, name = 'Admin') {
  const normalized = email.toLowerCase();
  const passwordHash = bcrypt.hashSync(password, 12);
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE lower(email) = lower($1)',
    [normalized],
  );

  if (existing) {
    await query(
      `UPDATE users SET password_hash = $1, role = 'admin', status = 'approved',
       approval_token = NULL, name = $2, updated_at = NOW(), is_active = TRUE
       WHERE id = $3`,
      [passwordHash, name, existing.id],
    );
    return;
  }

  await query(
    `INSERT INTO users (email, password_hash, name, role, status, approval_token)
     VALUES ($1, $2, $3, 'admin', 'approved', NULL)`,
    [normalized, passwordHash, name],
  );
}

export async function syncAdminFromEnv() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    if (process.env.NODE_ENV === 'production') {
      console.error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required in production.');
      process.exit(1);
    }
    console.warn('ADMIN_EMAIL and ADMIN_PASSWORD not set; skipping admin account sync.');
    return;
  }

  await resetAdminAccount(adminEmail, adminPassword);
  console.log(`Admin account synced for ${adminEmail}`);
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
  };
}
