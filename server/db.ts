/** @deprecated Auth now uses PostgreSQL via server/db/auth.ts. This file remains for legacy reference only. */
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'data', 'auth.db');

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
  created_at: string;
}

let db: Database.Database;

function ensureDb() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      approval_token TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

/** Create DB schema if needed. Does not sync admin credentials. */
export function initializeAuthDatabase() {
  ensureDb();
}

/** Create or update the admin account from ADMIN_EMAIL / ADMIN_PASSWORD. */
export function syncAdminFromEnv() {
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

  resetAdminAccount(adminEmail, adminPassword);
  console.log(`Admin account synced for ${adminEmail}`);
}

export function getUserByEmail(email: string): User | undefined {
  return ensureDb()
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .get(email.toLowerCase()) as User | undefined;
}

export function getUserById(id: number): User | undefined {
  return ensureDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByApprovalToken(token: string): User | undefined {
  return ensureDb()
    .prepare('SELECT * FROM users WHERE approval_token = ?')
    .get(token) as User | undefined;
}

export function createUser(email: string, passwordHash: string, name: string | null): User {
  const token = randomBytes(32).toString('hex');
  const result = ensureDb()
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, status, approval_token)
       VALUES (?, ?, ?, 'user', 'pending', ?)`
    )
    .run(email.toLowerCase(), passwordHash, name, token);
  return getUserById(Number(result.lastInsertRowid))!;
}

export function approveUserByToken(token: string): User | null {
  const user = getUserByApprovalToken(token);
  if (!user || user.status !== 'pending') return null;
  ensureDb()
    .prepare(`UPDATE users SET status = 'approved', approval_token = NULL WHERE id = ?`)
    .run(user.id);
  return getUserById(user.id)!;
}

export function approveUserById(id: number): User | null {
  const user = getUserById(id);
  if (!user || user.role === 'admin' || user.status !== 'pending') return null;
  ensureDb()
    .prepare(`UPDATE users SET status = 'approved', approval_token = NULL WHERE id = ?`)
    .run(id);
  return getUserById(id)!;
}

export function rejectUserById(id: number): User | null {
  const user = getUserById(id);
  if (!user || user.role === 'admin' || user.status !== 'pending') return null;
  ensureDb()
    .prepare(`UPDATE users SET status = 'rejected', approval_token = NULL WHERE id = ?`)
    .run(id);
  return getUserById(id)!;
}

export function listPendingUsers(): Omit<User, 'password_hash' | 'approval_token'>[] {
  return ensureDb()
    .prepare(
      `SELECT id, email, name, role, status, created_at FROM users
       WHERE status = 'pending' AND role = 'user'
       ORDER BY created_at ASC`
    )
    .all() as Omit<User, 'password_hash' | 'approval_token'>[];
}

export function resetAdminAccount(email: string, password: string, name = 'Admin') {
  const database = ensureDb(); // schema only
  const normalized = email.toLowerCase();
  const passwordHash = bcrypt.hashSync(password, 12);
  const existing = database
    .prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE')
    .get(normalized) as { id: number } | undefined;

  if (existing) {
    database
      .prepare(
        `UPDATE users
         SET password_hash = ?, role = 'admin', status = 'approved', approval_token = NULL, name = ?
         WHERE id = ?`
      )
      .run(passwordHash, name, existing.id);
    return;
  }

  database
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, status, approval_token)
       VALUES (?, ?, ?, 'admin', 'approved', NULL)`
    )
    .run(normalized, passwordHash, name);
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
