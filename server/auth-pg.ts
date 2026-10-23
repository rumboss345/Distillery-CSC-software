import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { hashResetToken, newResetToken, resetTokenExpired } from './password-reset.js';
import {
  DEFAULT_USER_PERMISSIONS,
  PROCESS_STAGE_KEYS,
  sanitizePermissions,
  sanitizeProcessStages,
  type PermissionKey,
  type ProcessStageKey,
} from './permissions.js';
import type { ProcessAssignmentEntry, PublicUser, User, UserRole } from './auth-sqlite.js';
import { getPool } from './pg.js';

function mapUser(row: Record<string, unknown> | undefined): User | undefined {
  if (!row) return undefined;
  return {
    id: Number(row.id),
    email: String(row.email),
    password_hash: String(row.password_hash),
    name: row.name == null ? null : String(row.name),
    role: row.role as UserRole,
    status: row.status as User['status'],
    approval_token: row.approval_token == null ? null : String(row.approval_token),
    created_at: String(row.created_at),
  };
}

export async function initializeAuthDatabase(): Promise<void> {
  await getPool().query('SELECT 1');
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const result = await getPool().query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  return mapUser(result.rows[0]);
}

export async function getUserById(id: number): Promise<User | undefined> {
  const result = await getPool().query('SELECT * FROM users WHERE id = $1', [id]);
  return mapUser(result.rows[0]);
}

export async function getUserByApprovalToken(token: string): Promise<User | undefined> {
  const result = await getPool().query('SELECT * FROM users WHERE approval_token = $1', [token]);
  return mapUser(result.rows[0]);
}

export async function getUserPermissions(userId: number): Promise<PermissionKey[]> {
  const result = await getPool().query(
    'SELECT permission_key FROM user_permissions WHERE user_id = $1 ORDER BY permission_key',
    [userId],
  );
  return sanitizePermissions(result.rows.map((row) => String(row.permission_key)));
}

export async function getUserProcessAssignments(userId: number): Promise<ProcessStageKey[]> {
  const result = await getPool().query(
    'SELECT stage_key FROM user_process_assignments WHERE user_id = $1 ORDER BY stage_key',
    [userId],
  );
  return sanitizeProcessStages(result.rows.map((row) => String(row.stage_key)));
}

export async function setUserPermissions(userId: number, permissions: PermissionKey[]): Promise<void> {
  const keys = sanitizePermissions(permissions);
  const pool = getPool();
  await pool.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
  for (const key of keys) {
    await pool.query(
      'INSERT INTO user_permissions (user_id, permission_key) VALUES ($1, $2)',
      [userId, key],
    );
  }
}

export async function setUserProcessAssignments(userId: number, stages: ProcessStageKey[]): Promise<void> {
  const keys = sanitizeProcessStages(stages);
  const pool = getPool();
  await pool.query('DELETE FROM user_process_assignments WHERE user_id = $1', [userId]);
  for (const key of keys) {
    await pool.query(
      'INSERT INTO user_process_assignments (user_id, stage_key) VALUES ($1, $2)',
      [userId, key],
    );
  }
}

export async function publicUser(user: User): Promise<PublicUser> {
  const permissions = user.role === 'admin' ? [...DEFAULT_USER_PERMISSIONS] : await getUserPermissions(user.id);
  const processAssignments = user.role === 'admin'
    ? sanitizeProcessStages([...PROCESS_STAGE_KEYS])
    : await getUserProcessAssignments(user.id);
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

export async function createUser(email: string, passwordHash: string, name: string | null): Promise<User> {
  const token = randomBytes(32).toString('hex');
  const result = await getPool().query(
    `INSERT INTO users (email, password_hash, name, role, status, approval_token)
     VALUES ($1, $2, $3, 'user', 'pending', $4)
     RETURNING id`,
    [email.toLowerCase(), passwordHash, name, token],
  );
  const user = (await getUserById(Number(result.rows[0].id)))!;
  await setUserPermissions(user.id, DEFAULT_USER_PERMISSIONS);
  return user;
}

export async function createUserByAdmin(
  email: string,
  password: string,
  name: string | null,
  permissions: PermissionKey[],
  processAssignments: ProcessStageKey[],
  role: UserRole = 'user',
): Promise<User> {
  const normalized = email.toLowerCase();
  if (await getUserByEmail(normalized)) throw new Error('An account with this email already exists');
  const isAdmin = role === 'admin';
  const passwordHash = bcrypt.hashSync(password, 12);
  const result = await getPool().query(
    `INSERT INTO users (email, password_hash, name, role, status, approval_token)
     VALUES ($1, $2, $3, $4, 'approved', NULL)
     RETURNING id`,
    [normalized, passwordHash, name, isAdmin ? 'admin' : 'user'],
  );
  const user = (await getUserById(Number(result.rows[0].id)))!;
  await setUserPermissions(user.id, isAdmin ? [...DEFAULT_USER_PERMISSIONS] : permissions);
  await setUserProcessAssignments(user.id, isAdmin ? [...PROCESS_STAGE_KEYS] : processAssignments);
  return user;
}

export async function updateUserByAdmin(
  id: number,
  updates: {
    name?: string | null;
    permissions?: PermissionKey[];
    processAssignments?: ProcessStageKey[];
    password?: string;
  },
): Promise<User | null> {
  const user = await getUserById(id);
  if (!user || user.role === 'admin') return null;
  if (updates.name !== undefined) {
    await getPool().query('UPDATE users SET name = $1 WHERE id = $2', [updates.name, id]);
  }
  if (updates.password) {
    const passwordHash = bcrypt.hashSync(updates.password, 12);
    await getPool().query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    await getPool().query('DELETE FROM password_reset_tokens WHERE user_id = $1', [id]);
  }
  if (updates.permissions) await setUserPermissions(id, updates.permissions);
  if (updates.processAssignments) await setUserProcessAssignments(id, updates.processAssignments);
  return (await getUserById(id)) ?? null;
}

export async function deleteUserById(id: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const user = await getUserById(id);
  if (!user) return { ok: false, reason: 'User not found' };
  if (user.role === 'admin') return { ok: false, reason: 'Cannot remove admin accounts' };
  await getPool().query('DELETE FROM password_reset_tokens WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM users WHERE id = $1', [id]);
  return { ok: true };
}

export async function countAdmins(): Promise<number> {
  const result = await getPool().query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`);
  return Number(result.rows[0].count);
}

export async function approveUserByToken(token: string): Promise<User | null> {
  const user = await getUserByApprovalToken(token);
  if (!user || user.status !== 'pending') return null;
  await getPool().query(`UPDATE users SET status = 'approved', approval_token = NULL WHERE id = $1`, [user.id]);
  const approved = (await getUserById(user.id))!;
  if ((await getUserPermissions(approved.id)).length === 0) {
    await setUserPermissions(approved.id, DEFAULT_USER_PERMISSIONS);
  }
  return approved;
}

export async function approveUserById(id: number): Promise<User | null> {
  const user = await getUserById(id);
  if (!user || user.role === 'admin' || user.status !== 'pending') return null;
  await getPool().query(`UPDATE users SET status = 'approved', approval_token = NULL WHERE id = $1`, [id]);
  const approved = (await getUserById(id))!;
  if ((await getUserPermissions(approved.id)).length === 0) {
    await setUserPermissions(approved.id, DEFAULT_USER_PERMISSIONS);
  }
  return approved;
}

export async function rejectUserById(id: number): Promise<User | null> {
  const user = await getUserById(id);
  if (!user || user.role === 'admin' || user.status !== 'pending') return null;
  await getPool().query(`UPDATE users SET status = 'rejected', approval_token = NULL WHERE id = $1`, [id]);
  return (await getUserById(id)) ?? null;
}

export async function listPendingUsers(): Promise<PublicUser[]> {
  const result = await getPool().query(
    `SELECT * FROM users WHERE status = 'pending' AND role = 'user' ORDER BY created_at ASC`,
  );
  const users = result.rows.map((row) => mapUser(row)!);
  return Promise.all(users.map((user) => publicUser(user)));
}

export async function listAllUsers(): Promise<PublicUser[]> {
  const result = await getPool().query(`SELECT * FROM users ORDER BY role DESC, email ASC`);
  const users = result.rows.map((row) => mapUser(row)!);
  return Promise.all(users.map((user) => publicUser(user)));
}

export async function listAssignableUsers(): Promise<ProcessAssignmentEntry[]> {
  const result = await getPool().query(
    `SELECT id, email, name FROM users WHERE status = 'approved' ORDER BY lower(coalesce(name, '')), lower(email)`,
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    email: String(row.email),
    name: row.name == null ? null : String(row.name),
  }));
}

export async function listProcessAssignmentsByStage(): Promise<Record<string, ProcessAssignmentEntry[]>> {
  const result = await getPool().query(
    `SELECT u.id, u.email, u.name, a.stage_key
     FROM user_process_assignments a
     JOIN users u ON u.id = a.user_id
     WHERE u.status = 'approved'
     ORDER BY a.stage_key, u.email`,
  );
  const map: Record<string, ProcessAssignmentEntry[]> = {};
  for (const row of result.rows) {
    const stage = String(row.stage_key);
    if (!map[stage]) map[stage] = [];
    map[stage].push({
      id: Number(row.id),
      email: String(row.email),
      name: row.name == null ? null : String(row.name),
    });
  }
  return map;
}

export async function resetAdminAccount(email: string, password: string, name = 'Admin'): Promise<void> {
  const normalized = email.toLowerCase();
  const passwordHash = bcrypt.hashSync(password, 12);
  const existing = await getPool().query('SELECT id FROM users WHERE lower(email) = lower($1)', [normalized]);
  if (existing.rows[0]) {
    await getPool().query(
      `UPDATE users
       SET password_hash = $1, role = 'admin', status = 'approved', approval_token = NULL, name = $2
       WHERE id = $3`,
      [passwordHash, name, existing.rows[0].id],
    );
    return;
  }
  await getPool().query(
    `INSERT INTO users (email, password_hash, name, role, status, approval_token)
     VALUES ($1, $2, $3, 'admin', 'approved', NULL)`,
    [normalized, passwordHash, name],
  );
}

export async function syncAdminFromEnv(): Promise<void> {
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

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await getUserByEmail(email);
  if (!user || user.status !== 'approved') return null;
  const issued = newResetToken();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    await client.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, issued.tokenHash, issued.expiresAt],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return issued.token;
}

export async function resetPasswordWithToken(token: string, password: string): Promise<boolean> {
  const tokenHash = hashResetToken(token.trim());
  const found = await getPool().query(
    'SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  const row = found.rows[0] as { user_id: number; expires_at: string } | undefined;
  if (!row || resetTokenExpired(String(row.expires_at))) {
    if (row) await getPool().query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
    return false;
  }
  const passwordHash = bcrypt.hashSync(password, 12);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, row.user_id]);
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [row.user_id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return true;
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  nextPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUserById(userId);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return { ok: false, error: 'Current password is incorrect' };
  }
  const passwordHash = bcrypt.hashSync(nextPassword, 12);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { ok: true };
}
