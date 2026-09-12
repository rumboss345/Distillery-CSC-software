import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ACTION_ASSIGNMENT_KEYS,
  DEFAULT_USER_PERMISSIONS,
  sanitizeActionAssignments,
  sanitizePermissions,
  sanitizeProcessStages,
  type ActionAssignmentKey,
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
  actionAssignments: ActionAssignmentKey[];
  /** @deprecated use actionAssignments */
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

    CREATE TABLE IF NOT EXISTS user_action_assignments (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_key TEXT NOT NULL,
      PRIMARY KEY (user_id, action_key)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_key TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
  `);
  migrateExistingUserPermissions();
  migrateProcessAssignmentsToActions();
  return db;
}

function migrateProcessAssignmentsToActions() {
  if (!db) return;
  db.run(`
    INSERT OR IGNORE INTO user_action_assignments (user_id, action_key)
    SELECT user_id, stage_key FROM user_process_assignments
  `);
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
  return sanitizeProcessStages(getUserActionAssignments(userId));
}

export function getUserActionAssignments(userId: number): ActionAssignmentKey[] {
  const rows = ensureDb()
    .prepare('SELECT action_key FROM user_action_assignments WHERE user_id = ? ORDER BY action_key')
    .all(userId) as { action_key: string }[];
  return sanitizeActionAssignments(rows.map((r) => r.action_key));
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
  setUserActionAssignments(userId, sanitizeActionAssignments(stages));
}

export function setUserActionAssignments(userId: number, actions: ActionAssignmentKey[]) {
  const database = ensureDb();
  const keys = sanitizeActionAssignments(actions);
  database.prepare('DELETE FROM user_action_assignments WHERE user_id = ?').run(userId);
  database.prepare('DELETE FROM user_process_assignments WHERE user_id = ?').run(userId);
  const insertAction = database.prepare(
    'INSERT INTO user_action_assignments (user_id, action_key) VALUES (?, ?)',
  );
  const insertProcess = database.prepare(
    'INSERT INTO user_process_assignments (user_id, stage_key) VALUES (?, ?)',
  );
  for (const key of keys) {
    insertAction.run(userId, key);
    if (sanitizeProcessStages([key]).length === 1) {
      insertProcess.run(userId, key);
    }
  }
}

export function publicUser(user: User): PublicUser {
  const permissions =
    user.role === 'admin' ? [...DEFAULT_USER_PERMISSIONS] : getUserPermissions(user.id);
  const actionAssignments =
    user.role === 'admin'
      ? [...ACTION_ASSIGNMENT_KEYS]
      : getUserActionAssignments(user.id);
  const processAssignments = sanitizeProcessStages(actionAssignments);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    permissions,
    actionAssignments,
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
  actionAssignments: ActionAssignmentKey[],
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
  setUserActionAssignments(user.id, actionAssignments);
  return user;
}

export function updateUserByAdmin(
  id: number,
  updates: {
    name?: string | null;
    permissions?: PermissionKey[];
    actionAssignments?: ActionAssignmentKey[];
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
  if (updates.actionAssignments) {
    setUserActionAssignments(id, updates.actionAssignments);
  } else if (updates.processAssignments) {
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

export function listActionAssignmentsByKey(): Record<string, ProcessAssignmentEntry[]> {
  const rows = ensureDb()
    .prepare(
      `SELECT u.id, u.email, u.name, a.action_key
       FROM user_action_assignments a
       JOIN users u ON u.id = a.user_id
       WHERE u.status = 'approved'
       ORDER BY a.action_key, u.email`,
    )
    .all() as { id: number; email: string; name: string | null; action_key: string }[];

  const map: Record<string, ProcessAssignmentEntry[]> = {};
  for (const row of rows) {
    if (!map[row.action_key]) map[row.action_key] = [];
    map[row.action_key].push({ id: row.id, email: row.email, name: row.name });
  }
  return map;
}

const STAGE_ACTION_ALIASES: Record<string, string[]> = {
  preparation: ['preparation', 'wash'],
  fermentation: ['fermentation', 'wash'],
  distillation: ['distillation'],
  storage: ['storage', 'equipment'],
  other: ['other', 'equipment'],
};

export function listProcessAssignmentsByStage(): Record<string, ProcessAssignmentEntry[]> {
  const all = listActionAssignmentsByKey();
  const map: Record<string, ProcessAssignmentEntry[]> = {};
  for (const [stage, aliases] of Object.entries(STAGE_ACTION_ALIASES)) {
    const merged: ProcessAssignmentEntry[] = [];
    for (const alias of aliases) {
      for (const u of all[alias] ?? []) {
        if (!merged.some((m) => m.id === u.id)) merged.push(u);
      }
    }
    if (merged.length > 0) map[stage] = merged;
  }
  return map;
}

export interface ActivityEntry {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string;
  action_key: string;
  description: string;
  created_at: string;
}

export function logActivity(userId: number, actionKey: string, description: string): void {
  const key = sanitizeActionAssignments([actionKey])[0];
  if (!key) return;
  ensureDb()
    .prepare('INSERT INTO activity_log (user_id, action_key, description) VALUES (?, ?, ?)')
    .run(userId, key, description.slice(0, 500));
}

export function listRecentActivity(limit = 30): ActivityEntry[] {
  const cap = Math.min(Math.max(limit, 1), 100);
  return ensureDb()
    .prepare(
      `SELECT l.id, l.user_id, u.name as user_name, u.email as user_email,
              l.action_key, l.description, l.created_at
       FROM activity_log l
       JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC
       LIMIT ?`,
    )
    .all(cap) as ActivityEntry[];
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
