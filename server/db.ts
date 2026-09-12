import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_USER_PERMISSIONS,
  sanitizePermissions,
  sanitizeProcessStages,
  type PermissionKey,
  type ProcessStageKey,
} from './permissions.js';

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

export interface PublicUser {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  permissions: PermissionKey[];
  processAssignments: ProcessStageKey[];
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

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_key TEXT NOT NULL,
      PRIMARY KEY (user_id, permission_key)
    );

    CREATE TABLE IF NOT EXISTS user_process_assignments (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stage_key TEXT NOT NULL,
      PRIMARY KEY (user_id, stage_key)
    );
  `);
  migrateExistingUserPermissions();
  return db;
}

function migrateExistingUserPermissions() {
  const approvedUsers = db
    .prepare(`SELECT id, role FROM users WHERE status = 'approved' AND role = 'user'`)
    .all() as { id: number; role: UserRole }[];

  const countStmt = db.prepare(
    'SELECT COUNT(*) as count FROM user_permissions WHERE user_id = ?',
  );

  for (const user of approvedUsers) {
    const row = countStmt.get(user.id) as { count: number };
    if (row.count === 0) {
      setUserPermissions(user.id, DEFAULT_USER_PERMISSIONS);
    }
  }
}

export function initializeAuthDatabase() {
  ensureDb();
}

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

export function getUserPermissions(userId: number): PermissionKey[] {
  const rows = ensureDb()
    .prepare('SELECT permission_key FROM user_permissions WHERE user_id = ? ORDER BY permission_key')
    .all(userId) as { permission_key: string }[];
  return sanitizePermissions(rows.map((r) => r.permission_key));
}

export function getUserProcessAssignments(userId: number): ProcessStageKey[] {
  const rows = ensureDb()
    .prepare('SELECT stage_key FROM user_process_assignments WHERE user_id = ? ORDER BY stage_key')
    .all(userId) as { stage_key: string }[];
  return sanitizeProcessStages(rows.map((r) => r.stage_key));
}

export function setUserPermissions(userId: number, permissions: PermissionKey[]) {
  const database = ensureDb();
  const keys = sanitizePermissions(permissions);
  database.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);
  const insert = database.prepare(
    'INSERT INTO user_permissions (user_id, permission_key) VALUES (?, ?)',
  );
  for (const key of keys) {
    insert.run(userId, key);
  }
}

export function setUserProcessAssignments(userId: number, stages: ProcessStageKey[]) {
  const database = ensureDb();
  const keys = sanitizeProcessStages(stages);
  database.prepare('DELETE FROM user_process_assignments WHERE user_id = ?').run(userId);
  const insert = database.prepare(
    'INSERT INTO user_process_assignments (user_id, stage_key) VALUES (?, ?)',
  );
  for (const key of keys) {
    insert.run(userId, key);
  }
}

export function publicUser(user: User): PublicUser {
  const permissions =
    user.role === 'admin' ? [...DEFAULT_USER_PERMISSIONS] : getUserPermissions(user.id);
  const processAssignments =
    user.role === 'admin'
      ? sanitizeProcessStages([
          'preparation',
          'fermentation',
          'distillation',
          'storage',
          'other',
        ])
      : getUserProcessAssignments(user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    permissions,
    processAssignments,
  };
}

export function createUser(email: string, passwordHash: string, name: string | null): User {
  const token = randomBytes(32).toString('hex');
  const result = ensureDb()
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, status, approval_token)
       VALUES (?, ?, ?, 'user', 'pending', ?)`,
    )
    .run(email.toLowerCase(), passwordHash, name, token);
  const user = getUserById(Number(result.lastInsertRowid))!;
  setUserPermissions(user.id, DEFAULT_USER_PERMISSIONS);
  return user;
}

export function createUserByAdmin(
  email: string,
  password: string,
  name: string | null,
  permissions: PermissionKey[],
  processAssignments: ProcessStageKey[],
): User {
  const normalized = email.toLowerCase();
  if (getUserByEmail(normalized)) {
    throw new Error('An account with this email already exists');
  }
  const passwordHash = bcrypt.hashSync(password, 12);
  const result = ensureDb()
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, status, approval_token)
       VALUES (?, ?, ?, 'user', 'approved', NULL)`,
    )
    .run(normalized, passwordHash, name);
  const user = getUserById(Number(result.lastInsertRowid))!;
  setUserPermissions(user.id, permissions);
  setUserProcessAssignments(user.id, processAssignments);
  return user;
}

export function updateUserByAdmin(
  id: number,
  updates: {
    name?: string | null;
    permissions?: PermissionKey[];
    processAssignments?: ProcessStageKey[];
  },
): User | null {
  const user = getUserById(id);
  if (!user || user.role === 'admin') return null;

  if (updates.name !== undefined) {
    ensureDb().prepare('UPDATE users SET name = ? WHERE id = ?').run(updates.name, id);
  }
  if (updates.permissions) {
    setUserPermissions(id, updates.permissions);
  }
  if (updates.processAssignments) {
    setUserProcessAssignments(id, updates.processAssignments);
  }
  return getUserById(id)!;
}

export function deleteUserById(id: number): { ok: true } | { ok: false; reason: string } {
  const user = getUserById(id);
  if (!user) return { ok: false, reason: 'User not found' };
  if (user.role === 'admin') return { ok: false, reason: 'Cannot remove admin accounts' };

  ensureDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  return { ok: true };
}

export function countAdmins(): number {
  const row = ensureDb()
    .prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`)
    .get() as { count: number };
  return row.count;
}

export function approveUserByToken(token: string): User | null {
  const user = getUserByApprovalToken(token);
  if (!user || user.status !== 'pending') return null;
  ensureDb()
    .prepare(`UPDATE users SET status = 'approved', approval_token = NULL WHERE id = ?`)
    .run(user.id);
  const approved = getUserById(user.id)!;
  if (getUserPermissions(approved.id).length === 0) {
    setUserPermissions(approved.id, DEFAULT_USER_PERMISSIONS);
  }
  return approved;
}

export function approveUserById(id: number): User | null {
  const user = getUserById(id);
  if (!user || user.role === 'admin' || user.status !== 'pending') return null;
  ensureDb()
    .prepare(`UPDATE users SET status = 'approved', approval_token = NULL WHERE id = ?`)
    .run(id);
  const approved = getUserById(id)!;
  if (getUserPermissions(approved.id).length === 0) {
    setUserPermissions(approved.id, DEFAULT_USER_PERMISSIONS);
  }
  return approved;
}

export function rejectUserById(id: number): User | null {
  const user = getUserById(id);
  if (!user || user.role === 'admin' || user.status !== 'pending') return null;
  ensureDb()
    .prepare(`UPDATE users SET status = 'rejected', approval_token = NULL WHERE id = ?`)
    .run(id);
  return getUserById(id)!;
}

export function listPendingUsers(): PublicUser[] {
  const rows = ensureDb()
    .prepare(
      `SELECT * FROM users
       WHERE status = 'pending' AND role = 'user'
       ORDER BY created_at ASC`,
    )
    .all() as User[];
  return rows.map(publicUser);
}

export function listAllUsers(): PublicUser[] {
  const rows = ensureDb()
    .prepare(`SELECT * FROM users ORDER BY role DESC, email ASC`)
    .all() as User[];
  return rows.map(publicUser);
}

export interface ProcessAssignmentEntry {
  id: number;
  email: string;
  name: string | null;
}

export function listProcessAssignmentsByStage(): Record<string, ProcessAssignmentEntry[]> {
  const rows = ensureDb()
    .prepare(
      `SELECT u.id, u.email, u.name, a.stage_key
       FROM user_process_assignments a
       JOIN users u ON u.id = a.user_id
       WHERE u.status = 'approved'
       ORDER BY a.stage_key, u.email`,
    )
    .all() as { id: number; email: string; name: string | null; stage_key: string }[];

  const map: Record<string, ProcessAssignmentEntry[]> = {};
  for (const row of rows) {
    if (!map[row.stage_key]) map[row.stage_key] = [];
    map[row.stage_key].push({ id: row.id, email: row.email, name: row.name });
  }
  return map;
}

export function resetAdminAccount(email: string, password: string, name = 'Admin') {
  const database = ensureDb();
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
         WHERE id = ?`,
      )
      .run(passwordHash, name, existing.id);
    return;
  }

  database
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, status, approval_token)
       VALUES (?, ?, ?, 'admin', 'approved', NULL)`,
    )
    .run(normalized, passwordHash, name);
}
