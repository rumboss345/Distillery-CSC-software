import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { hashResetToken, newResetToken, resetTokenExpired } from './password-reset.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_USER_PERMISSIONS,
  PROCESS_STAGE_KEYS,
  sanitizePermissions,
  sanitizeProcessStages,
  type PermissionKey,
  type ProcessStageKey,
} from './permissions.js';
import {
  LAST_OWNER_ERROR,
  OWNER_CREATE_ERROR,
  OWNER_REMOVE_ERROR,
  OWNER_RESET_ADMIN_ERROR,
  isAdminRole,
  isOwnerRole,
  isReservedAuthEmail,
  isSiteOwnerEmail,
  RESERVED_AUTH_EMAIL_ERROR,
  siteOwnerEmail,
  type AuthRole,
} from '../src/lib/roles.ts';
import type { StaffMessageRow } from './staff-messages.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, 'data');
const DB_PATH = join(DATA_DIR, 'auth.db');

export type UserRole = AuthRole;
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
  /** This account is recreated, and its password replaced, from the website settings on each start. */
  restoredFromSettings: boolean;
}

function restoredFromSettings(email: string, role: UserRole): boolean {
  if (isOwnerRole(role) || isSiteOwnerEmail(email)) return false;
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(configured && email.toLowerCase() === configured);
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
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('owner', 'admin', 'user')),
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

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_staff_messages_recipient ON staff_messages(recipient_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_staff_messages_sender ON staff_messages(sender_id, created_at DESC);
  `);
  migrateUserRoles();
  migrateExistingUserPermissions();
  promoteSiteOwner();
  return db;
}

function migrateUserRoles() {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get() as { sql: string } | undefined;
  if (!row?.sql || row.sql.includes("'owner'")) return;
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE users_role_upgrade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('owner', 'admin', 'user')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      approval_token TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users_role_upgrade (id, email, password_hash, name, role, status, approval_token, created_at)
      SELECT id, email, password_hash, name, role, status, approval_token, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_role_upgrade RENAME TO users;
    PRAGMA foreign_keys = ON;
  `);
}

export function promoteSiteOwner(): void {
  const email = siteOwnerEmail();
  if (!email) return;
  ensureDb()
    .prepare(
      `UPDATE users
       SET role = 'owner', status = 'approved', approval_token = NULL
       WHERE email = ? COLLATE NOCASE`,
    )
    .run(email);
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
  promoteSiteOwner();
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
    isAdminRole(user.role) ? [...DEFAULT_USER_PERMISSIONS] : getUserPermissions(user.id);
  const processAssignments =
    isAdminRole(user.role)
      ? sanitizeProcessStages([...PROCESS_STAGE_KEYS])
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
    restoredFromSettings: restoredFromSettings(user.email, user.role),
  };
}

export function createUser(email: string, passwordHash: string, name: string | null): User {
  if (isReservedAuthEmail(email)) throw new Error(RESERVED_AUTH_EMAIL_ERROR);
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
  role: UserRole = 'user',
  actorRole: UserRole = 'admin',
): User {
  const normalized = email.toLowerCase();
  if (getUserByEmail(normalized)) {
    throw new Error('An account with this email already exists');
  }
  let storedRole: UserRole = role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : 'user';
  if (isSiteOwnerEmail(normalized)) storedRole = 'owner';
  if (storedRole === 'owner' && !isOwnerRole(actorRole) && !isSiteOwnerEmail(normalized)) {
    throw new Error(OWNER_CREATE_ERROR);
  }
  const fullAccess = isAdminRole(storedRole);
  const passwordHash = bcrypt.hashSync(password, 12);
  const result = ensureDb()
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, status, approval_token)
       VALUES (?, ?, ?, ?, 'approved', NULL)`,
    )
    .run(normalized, passwordHash, name, storedRole);
  const user = getUserById(Number(result.lastInsertRowid))!;
  setUserPermissions(user.id, fullAccess ? [...DEFAULT_USER_PERMISSIONS] : permissions);
  setUserProcessAssignments(
    user.id,
    fullAccess ? [...PROCESS_STAGE_KEYS] : processAssignments,
  );
  return user;
}

export function updateUserByAdmin(
  id: number,
  updates: {
    name?: string | null;
    permissions?: PermissionKey[];
    processAssignments?: ProcessStageKey[];
    password?: string;
  },
  actorRole: UserRole = 'admin',
): User | null {
  const user = getUserById(id);
  if (!user) return null;
  if (updates.password && isAdminRole(user.role) && !isOwnerRole(actorRole)) {
    throw new Error(OWNER_RESET_ADMIN_ERROR);
  }

  if (updates.name !== undefined) {
    ensureDb().prepare('UPDATE users SET name = ? WHERE id = ?').run(updates.name, id);
  }
  if (updates.password) {
    const passwordHash = bcrypt.hashSync(updates.password, 12);
    ensureDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
    ensureDb().prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(id);
  }
  if (!isAdminRole(user.role)) {
    if (updates.permissions) {
      setUserPermissions(id, updates.permissions);
    }
    if (updates.processAssignments) {
      setUserProcessAssignments(id, updates.processAssignments);
    }
  }
  return getUserById(id)!;
}

export function countOwners(): number {
  const row = ensureDb()
    .prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'owner'`)
    .get() as { count: number };
  return row.count;
}

export function deleteUserById(
  id: number,
  actorRole: UserRole = 'admin',
): { ok: true } | { ok: false; reason: string } {
  const user = getUserById(id);
  if (!user) return { ok: false, reason: 'User not found' };
  if (user.role === 'owner') {
    if (!isOwnerRole(actorRole)) return { ok: false, reason: OWNER_REMOVE_ERROR };
    if (countOwners() <= 1) return { ok: false, reason: LAST_OWNER_ERROR };
  }

  ensureDb().prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(id);
  ensureDb().prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);
  ensureDb().prepare('DELETE FROM user_process_assignments WHERE user_id = ?').run(id);
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
  if (!user || isAdminRole(user.role) || user.status !== 'pending') return null;
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
  if (!user || isAdminRole(user.role) || user.status !== 'pending') return null;
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
    .prepare(
      `SELECT * FROM users
       ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, email COLLATE NOCASE`,
    )
    .all() as User[];
  return rows.map(publicUser);
}

export function listAssignableUsers(): ProcessAssignmentEntry[] {
  const rows = ensureDb()
    .prepare(
      `SELECT id, email, name
       FROM users
       WHERE status = 'approved'
       ORDER BY name COLLATE NOCASE, email COLLATE NOCASE`,
    )
    .all() as { id: number; email: string; name: string | null }[];
  return rows.map((row) => ({ id: row.id, email: row.email, name: row.name }));
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
  const existing = getUserByEmail(normalized);

  if (existing && (isOwnerRole(existing.role) || isSiteOwnerEmail(normalized))) {
    database
      .prepare(
        `UPDATE users
         SET role = 'owner', status = 'approved', approval_token = NULL
         WHERE id = ?`,
      )
      .run(existing.id);
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const storedRole: UserRole = isSiteOwnerEmail(normalized) ? 'owner' : 'admin';
  if (existing) {
    database
      .prepare(
        `UPDATE users
         SET password_hash = ?, role = ?, status = 'approved', approval_token = NULL, name = ?
         WHERE id = ?`,
      )
      .run(passwordHash, storedRole, name, existing.id);
    return;
  }

  database
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, status, approval_token)
       VALUES (?, ?, ?, ?, 'approved', NULL)`,
    )
    .run(normalized, passwordHash, name, storedRole);
}

export function createPasswordResetToken(email: string): string | null {
  const user = getUserByEmail(email);
  if (!user || user.status !== 'approved' || isAdminRole(user.role)) return null;
  const issued = newResetToken();
  const database = ensureDb();
  const replace = database.transaction(() => {
    database.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
    database
      .prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(user.id, issued.tokenHash, issued.expiresAt);
  });
  replace();
  return issued.token;
}

export function resetPasswordWithToken(token: string, password: string): boolean {
  const tokenHash = hashResetToken(token.trim());
  const database = ensureDb();
  const row = database
    .prepare('SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ?')
    .get(tokenHash) as { user_id: number; expires_at: string } | undefined;
  if (!row || resetTokenExpired(row.expires_at)) {
    if (row) database.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
    return false;
  }
  const target = getUserById(row.user_id);
  if (!target || isAdminRole(target.role)) {
    database.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
    return false;
  }
  const passwordHash = bcrypt.hashSync(password, 12);
  const apply = database.transaction(() => {
    database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, row.user_id);
    database.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(row.user_id);
  });
  apply();
  return true;
}

export function changePassword(
  userId: number,
  currentPassword: string,
  nextPassword: string,
): { ok: true } | { ok: false; error: string } {
  const user = getUserById(userId);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return { ok: false, error: 'Current password is incorrect' };
  }
  const passwordHash = bcrypt.hashSync(nextPassword, 12);
  const database = ensureDb();
  const apply = database.transaction(() => {
    database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
    database.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
  });
  apply();
  return { ok: true };
}

const STAFF_MESSAGE_SELECT = `
  SELECT m.id, m.sender_id, m.recipient_id, m.body, m.created_at, m.read_at,
    s.email AS sender_email, s.name AS sender_name,
    r.email AS recipient_email, r.name AS recipient_name
  FROM staff_messages m
  JOIN users s ON s.id = m.sender_id
  JOIN users r ON r.id = m.recipient_id
`;

function mapStaffMessageRow(row: Record<string, unknown>): StaffMessageRow {
  return {
    id: Number(row.id),
    sender_id: Number(row.sender_id),
    recipient_id: Number(row.recipient_id),
    body: String(row.body),
    created_at: String(row.created_at),
    read_at: row.read_at == null ? null : String(row.read_at),
    sender_email: String(row.sender_email),
    sender_name: row.sender_name == null ? null : String(row.sender_name),
    recipient_email: String(row.recipient_email),
    recipient_name: row.recipient_name == null ? null : String(row.recipient_name),
  };
}

export function listStaffMessageRecipientIds(excludeUserId: number): number[] {
  const rows = ensureDb()
    .prepare(
      `SELECT id FROM users
       WHERE id != ?
         AND (status = 'approved' OR role IN ('admin', 'owner'))`,
    )
    .all(excludeUserId) as { id: number }[];
  return rows.map((row) => row.id);
}

export function createStaffMessageBroadcast(
  senderId: number,
  body: string,
): { recipientCount: number; messages: StaffMessageRow[] } {
  const recipientIds = listStaffMessageRecipientIds(senderId);
  if (recipientIds.length === 0) {
    return { recipientCount: 0, messages: [] };
  }
  const database = ensureDb();
  const insert = database.prepare(
    `INSERT INTO staff_messages (sender_id, recipient_id, body) VALUES (?, ?, ?)`,
  );
  const createdIds = database.transaction(() => {
    const ids: number[] = [];
    for (const recipientId of recipientIds) {
      const info = insert.run(senderId, recipientId, body);
      ids.push(Number(info.lastInsertRowid));
    }
    return ids;
  })();
  const messages = createdIds
    .map((id) => getStaffMessageById(id, senderId))
    .filter((row): row is StaffMessageRow => row != null);
  return { recipientCount: recipientIds.length, messages };
}

export function createStaffMessage(
  senderId: number,
  recipientId: number,
  body: string,
): StaffMessageRow | null {
  const database = ensureDb();
  const info = database
    .prepare(
      `INSERT INTO staff_messages (sender_id, recipient_id, body)
       VALUES (?, ?, ?)`,
    )
    .run(senderId, recipientId, body);
  const id = Number(info.lastInsertRowid);
  return getStaffMessageById(id, senderId);
}

export function getStaffMessageById(
  messageId: number,
  viewerId: number,
): StaffMessageRow | null {
  const row = ensureDb()
    .prepare(
      `${STAFF_MESSAGE_SELECT}
       WHERE m.id = ? AND (m.sender_id = ? OR m.recipient_id = ?)`,
    )
    .get(messageId, viewerId, viewerId) as Record<string, unknown> | undefined;
  return row ? mapStaffMessageRow(row) : null;
}

export function listStaffMessagesInbox(userId: number, limit: number): StaffMessageRow[] {
  const rows = ensureDb()
    .prepare(
      `${STAFF_MESSAGE_SELECT}
       WHERE m.recipient_id = ?
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(userId, limit) as Record<string, unknown>[];
  return rows.map(mapStaffMessageRow);
}

export function listStaffMessagesSent(userId: number, limit: number): StaffMessageRow[] {
  const rows = ensureDb()
    .prepare(
      `${STAFF_MESSAGE_SELECT}
       WHERE m.sender_id = ?
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(userId, limit) as Record<string, unknown>[];
  return rows.map(mapStaffMessageRow);
}

/** Direct messages between two staff members (newest first). For owner/admin oversight. */
export function listStaffMessagesBetween(
  staffA: number,
  staffB: number,
  limit: number,
): StaffMessageRow[] {
  const rows = ensureDb()
    .prepare(
      `${STAFF_MESSAGE_SELECT}
       WHERE (m.sender_id = ? AND m.recipient_id = ?)
          OR (m.sender_id = ? AND m.recipient_id = ?)
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(staffA, staffB, staffB, staffA, limit) as Record<string, unknown>[];
  return rows.map(mapStaffMessageRow);
}

export function countStaffMessagesUnread(userId: number): number {
  const row = ensureDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM staff_messages WHERE recipient_id = ? AND read_at IS NULL`,
    )
    .get(userId) as { n: number };
  return Number(row.n);
}

export function listStaffMessagesIncomingAfter(
  userId: number,
  afterId: number,
  limit: number,
): StaffMessageRow[] {
  const rows = ensureDb()
    .prepare(
      `${STAFF_MESSAGE_SELECT}
       WHERE m.recipient_id = ? AND m.id > ? AND m.read_at IS NULL
       ORDER BY m.id ASC
       LIMIT ?`,
    )
    .all(userId, afterId, limit) as Record<string, unknown>[];
  return rows.map(mapStaffMessageRow);
}

export function markStaffMessageRead(messageId: number, recipientId: number): boolean {
  const info = ensureDb()
    .prepare(
      `UPDATE staff_messages
       SET read_at = datetime('now')
       WHERE id = ? AND recipient_id = ? AND read_at IS NULL`,
    )
    .run(messageId, recipientId);
  return info.changes > 0;
}

export function markAllStaffMessagesRead(recipientId: number): number {
  const info = ensureDb()
    .prepare(
      `UPDATE staff_messages
       SET read_at = datetime('now')
       WHERE recipient_id = ? AND read_at IS NULL`,
    )
    .run(recipientId);
  return info.changes;
}

export function isApprovedStaffUser(userId: number): boolean {
  const row = ensureDb()
    .prepare(`SELECT status, role FROM users WHERE id = ?`)
    .get(userId) as { status: UserStatus; role: UserRole } | undefined;
  if (!row) return false;
  return row.status === 'approved' || isAdminRole(row.role);
}
