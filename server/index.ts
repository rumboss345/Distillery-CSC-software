import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import 'express-async-errors';
import { existsSync, readFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function loadEnvFile() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();
import {
  approveUserById,
  approveUserByToken,
  createUser,
  createUserByAdmin,
  deleteUserById,
  getUserByEmail,
  getUserById,
  initializeAuthDatabase,
  listAllUsers,
  listAssignableUsers,
  listPendingUsers,
  listProcessAssignmentsByStage,
  publicUser,
  rejectUserById,
  getUserPermissions,
  changePassword,
  createPasswordResetToken,
  resetPasswordWithToken,
  syncAdminFromEnv,
  updateUserByAdmin,
  countStaffMessagesUnread,
  createStaffMessage,
  createStaffMessageBroadcast,
  listStaffMessagesIncomingAfter,
  listStaffMessagesBetween,
  listStaffMessagesInbox,
  listStaffMessagesSent,
  markAllStaffMessagesRead,
  markStaffMessageRead,
  normalizeStaffMessageBody,
  isApprovedStaffUser,
  type User,
} from './db.js';
import { sanitizePermissions, sanitizeProcessStages } from './permissions.js';
import {
  OWNER_CREATE_ERROR,
  OWNER_RESET_ADMIN_ERROR,
  OWNER_RESET_DATA_ERROR,
  isAdminRole,
  isOwnerRole,
  isReservedAuthEmail,
  parseCreatedRole,
  RESERVED_AUTH_EMAIL_ERROR,
} from '../src/lib/roles.ts';
import { sendAdminApprovalEmail, sendPasswordResetEmail } from './email.js';
import {
  clearDistilleryRecord,
  isSqliteDatabase,
  readDistilleryRecord,
  writeDistilleryRecord,
} from './distillery-store.js';
import { mutationAccess, userMayMutate, PRODUCTION_MUTATIONS } from '../src/db/production-catalog.ts';
import { installProcessErrorHandlers, requestErrorHandler } from './express-async.js';
import { usingPostgres, redactDatabaseUrl } from './pg.js';
import { blockSqliteWrite } from './sqlite-guard.js';
import { migrateDatabase } from './migrate.js';
import {
  clearProductionData,
  exportProductionBackup,
  initProductionEngine,
  archiveOldAuditEvents,
  listArchivedAuditEvents,
  listAuditEvents,
  productionRevision,
  productionSnapshot,
  AdminApprovalRequired,
  type AdminApproval,
  ProductionConflict,
  restoreProductionBackup,
  runProductionMutation,
} from './production-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
installProcessErrorHandlers();
const isProduction = process.env.NODE_ENV === 'production';

// Render sets PORT; local dev uses AUTH_PORT or 3001
const PORT = Number(process.env.PORT ?? process.env.AUTH_PORT ?? 3001);
const HOST = isProduction ? '0.0.0.0' : undefined;
const JWT_SECRET = process.env.JWT_SECRET ?? 'distillery-tracker-dev-secret-change-in-production';
const APP_URL = process.env.APP_URL ?? (isProduction ? undefined : 'http://localhost:5173');

if (isProduction && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET environment variable is required in production.');
  process.exit(1);
}

if (isProduction && !process.env.APP_URL) {
  console.warn(
    'APP_URL is not set. Approval email links may be incorrect. Set APP_URL to your Render service URL.'
  );
}

interface AuthPayload {
  userId: number;
  email: string;
  role: 'owner' | 'admin' | 'user';
}

const ADMIN_APPROVAL_PURPOSE = 'admin-approval';
const ADMIN_APPROVAL_TTL_SECONDS = 10 * 60;

interface AdminApprovalPayload {
  purpose: typeof ADMIN_APPROVAL_PURPOSE;
  forUserId: number;
  adminId: number;
  actions: string[];
}

function signAdminApproval(forUserId: number, adminId: number, actions: string[]) {
  const payload: AdminApprovalPayload = { purpose: ADMIN_APPROVAL_PURPOSE, forUserId, adminId, actions };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ADMIN_APPROVAL_TTL_SECONDS });
}

/** A valid approval is bound to the signed-in user and the action names the administrator approved. */
async function readAdminApproval(req: express.Request, action: string): Promise<AdminApproval | null> {
  const token = req.headers['x-admin-approval'];
  if (typeof token !== 'string' || !token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Partial<AdminApprovalPayload>;
    if (payload.purpose !== ADMIN_APPROVAL_PURPOSE) return null;
    if (payload.forUserId !== req.user!.id) return null;
    if (!Array.isArray(payload.actions) || !payload.actions.includes(action)) return null;
    const admin = await getUserById(Number(payload.adminId));
    if (!admin || !isAdminRole(admin.role)) return null;
    return { id: admin.id, email: admin.email };
  } catch {
    return null;
  }
}

function signToken(user: User) {
  const payload: AuthPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    if (!Number.isInteger(payload.userId)) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    const user = await getUserById(payload.userId);
    if (!user || (!isAdminRole(user.role) && user.status !== 'approved')) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    next(error);
  }
}

function adminMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!isAdminRole(req.user?.role)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

function ownerMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!isOwnerRole(req.user?.role)) {
    res.status(403).json({ error: OWNER_RESET_DATA_ERROR });
    return;
  }
  next();
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '30mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, database: usingPostgres() ? 'postgres' : 'sqlite' });
});

app.get('/api/distillery-db/revision', authMiddleware, (_req, res) => {
  const record = readDistilleryRecord();
  res.json({ revision: record.revision, updatedAt: record.updatedAt, clearedAt: record.clearedAt });
});

app.get('/api/distillery-db', authMiddleware, (_req, res) => {
  const record = readDistilleryRecord();
  res.json({
    revision: record.revision,
    updatedAt: record.updatedAt,
    clearedAt: record.clearedAt,
    database: record.database ? record.database.toString('base64') : null,
  });
});

app.put('/api/distillery-db', authMiddleware, blockSqliteWrite, (req, res) => {
  const baseRevision = Number(req.body?.baseRevision);
  const encoded = typeof req.body?.database === 'string' ? req.body.database : '';
  if (!Number.isInteger(baseRevision) || baseRevision < 0 || !encoded) {
    res.status(400).json({ error: 'A database and the revision it was based on are required.' });
    return;
  }
  const database = Buffer.from(encoded, 'base64');
  if (!isSqliteDatabase(database) || database.length > 20 * 1024 * 1024) {
    res.status(400).json({ error: 'The shared record must be a SQLite database under 20 MB.' });
    return;
  }
  const saved = writeDistilleryRecord(baseRevision, database);
  if (!saved.ok) {
    res.status(409).json({
      error: 'The shared distillery record changed.',
      revision: saved.revision,
      updatedAt: saved.updatedAt,
      clearedAt: saved.clearedAt,
      database: saved.database ? saved.database.toString('base64') : null,
    });
    return;
  }
  res.json({ revision: saved.revision, updatedAt: saved.updatedAt });
});

app.delete('/api/distillery-db', authMiddleware, adminMiddleware, blockSqliteWrite, (_req, res) => {
  const cleared = clearDistilleryRecord();
  res.json({ revision: 0, clearedAt: cleared.clearedAt });
});

app.post('/api/auth/register', async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const name = req.body.name ? String(req.body.name).trim() : null;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Enter a valid email address' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  if (await getUserByEmail(email)) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }
  if (isReservedAuthEmail(email)) {
    res.status(403).json({ error: RESERVED_AUTH_EMAIL_ERROR });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  let user;
  try {
    user = await createUser(email, passwordHash, name);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create account.';
    if (message === RESERVED_AUTH_EMAIL_ERROR) {
      res.status(403).json({ error: message });
      return;
    }
    throw error;
  }

  try {
    await sendAdminApprovalEmail({
      newUserEmail: user.email,
      newUserName: user.name,
      approvalToken: user.approval_token!,
    });
  } catch (err) {
    console.error('Failed to send approval email:', err);
  }

  res.status(201).json({
    message:
      'Account created. An email was sent to the administrator for approval. You can sign in after approval.',
    email: user.email,
  });
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await getUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (!isAdminRole(user.role)) {
    if (user.status === 'pending') {
      res.status(403).json({
        error: 'Your account is pending administrator approval. You will receive access after approval.',
        status: 'pending',
      });
      return;
    }
    if (user.status === 'rejected') {
      res.status(403).json({
        error: 'Your account was not approved. Contact the administrator.',
        status: 'rejected',
      });
      return;
    }
  }

  const token = signToken(user);
  res.json({ token, user: await publicUser(user) });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: await publicUser(req.user!) });
});

/**
 * Re-verify an administrator before sensitive actions (e.g. editing or deleting completed fermentations).
 * Returns a short-lived approval the signed-in user sends with those production actions.
 */
app.post('/api/auth/verify-admin', authMiddleware, async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const actions = Array.isArray(req.body.actions)
    ? [...new Set((req.body.actions as unknown[]).filter((name): name is string => (
      typeof name === 'string' && Boolean(PRODUCTION_MUTATIONS[name]?.adminApproval)
    )))]
    : [];

  if (!email || !password) {
    res.status(400).json({ error: 'Administrator email and password are required' });
    return;
  }

  const user = await getUserByEmail(email);
  if (!user || !isAdminRole(user.role) || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid administrator credentials' });
    return;
  }

  res.json({
    ok: true,
    email: user.email,
    approvalToken: actions.length > 0 ? signAdminApproval(req.user!.id, user.id, actions) : undefined,
    expiresInSeconds: ADMIN_APPROVAL_TTL_SECONDS,
  });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Enter a valid email address' });
    return;
  }

  const token = await createPasswordResetToken(email);
  if (token) {
    try {
      await sendPasswordResetEmail({ to: email, token });
    } catch {
      console.error('Failed to send password reset email');
    }
  }

  res.json({
    message: 'If that email belongs to an approved account, a reset link is on its way. It expires in one hour.',
  });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body.token ?? '').trim();
  const password = String(req.body.password ?? '');
  if (!token) {
    res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const updated = await resetPasswordWithToken(token, password);
  if (!updated) {
    res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    return;
  }
  res.json({ message: 'Password updated. You can sign in with the new password.' });
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const currentPassword = String(req.body.currentPassword ?? '');
  const newPassword = String(req.body.newPassword ?? '');
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const result = await changePassword(req.user!.id, currentPassword, newPassword);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ message: 'Password updated.' });
});

app.post('/api/auth/approve', async (req, res) => {
  const token = String(req.body.token ?? req.query.token ?? '').trim();
  if (!token) {
    res.status(400).json({ error: 'Approval token is required' });
    return;
  }

  const user = await approveUserByToken(token);
  if (!user) {
    res.status(404).json({ error: 'Invalid or expired approval link' });
    return;
  }

  res.json({
    message: `${user.email} has been approved. They can now sign in.`,
    user: await publicUser(user),
  });
});

app.get('/api/admin/pending-users', authMiddleware, adminMiddleware, async (_req, res) => {
  res.json({ users: await listPendingUsers() });
});

app.post('/api/admin/users/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const user = await approveUserById(id);
  if (!user) {
    res.status(404).json({ error: 'Pending user not found' });
    return;
  }
  res.json({ message: `${user.email} approved`, user: await publicUser(user) });
});

app.post('/api/admin/users/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const user = await rejectUserById(id);
  if (!user) {
    res.status(404).json({ error: 'Pending user not found' });
    return;
  }
  res.json({ message: `${user.email} rejected`, user: await publicUser(user) });
});

app.get('/api/process/assignments', authMiddleware, async (_req, res) => {
  res.json({ assignments: await listProcessAssignmentsByStage() });
});

app.get('/api/users/assignable', authMiddleware, async (_req, res) => {
  res.json({ users: await listAssignableUsers() });
});

const MESSAGE_LIST_LIMIT = 100;
const MESSAGE_POLL_LIMIT = 20;

app.get('/api/messages/summary', authMiddleware, async (req, res) => {
  const userId = req.user!.id;
  res.json({ unreadCount: await countStaffMessagesUnread(userId) });
});

app.get('/api/messages', authMiddleware, async (req, res) => {
  const userId = req.user!.id;
  const folder = String(req.query.folder ?? 'inbox');
  const limit = Math.min(MESSAGE_LIST_LIMIT, Math.max(1, Number(req.query.limit) || 50));
  const messages =
    folder === 'sent'
      ? await listStaffMessagesSent(userId, limit)
      : await listStaffMessagesInbox(userId, limit);
  res.json({ messages });
});

app.get('/api/messages/thread', authMiddleware, adminMiddleware, async (req, res) => {
  const staffA = Number(req.query.staffA);
  const staffB = Number(req.query.staffB);
  if (!Number.isInteger(staffA) || !Number.isInteger(staffB) || staffA <= 0 || staffB <= 0) {
    res.status(400).json({ error: 'Choose two staff members.' });
    return;
  }
  if (staffA === staffB) {
    res.status(400).json({ error: 'Choose two different staff members.' });
    return;
  }
  const okA = await isApprovedStaffUser(staffA);
  const okB = await isApprovedStaffUser(staffB);
  if (!okA || !okB) {
    res.status(400).json({ error: 'Those staff accounts are not available.' });
    return;
  }
  const limit = Math.min(MESSAGE_LIST_LIMIT, Math.max(1, Number(req.query.limit) || MESSAGE_LIST_LIMIT));
  const messages = await listStaffMessagesBetween(staffA, staffB, limit);
  res.json({ messages });
});

app.get('/api/messages/incoming', authMiddleware, async (req, res) => {
  const userId = req.user!.id;
  const afterId = Math.max(0, Number(req.query.afterId) || 0);
  const messages = await listStaffMessagesIncomingAfter(userId, afterId, MESSAGE_POLL_LIMIT);
  res.json({ messages });
});

app.post('/api/messages', authMiddleware, async (req, res) => {
  const senderId = req.user!.id;
  const body = normalizeStaffMessageBody(String(req.body.body ?? ''));
  if (!body) {
    res.status(400).json({ error: 'Enter a message (up to 2000 characters).' });
    return;
  }

  if (req.body.broadcast === true) {
    const result = await createStaffMessageBroadcast(senderId, body);
    if (result.recipientCount === 0) {
      res.status(400).json({ error: 'No other staff members are available to message.' });
      return;
    }
    res.status(201).json({ broadcast: true, recipientCount: result.recipientCount });
    return;
  }

  const recipientId = Number(req.body.recipientId);
  if (!Number.isInteger(recipientId) || recipientId <= 0) {
    res.status(400).json({ error: 'Choose who should receive this message.' });
    return;
  }
  if (recipientId === senderId) {
    res.status(400).json({ error: 'You cannot message yourself.' });
    return;
  }
  const recipientOk = await isApprovedStaffUser(recipientId);
  if (!recipientOk) {
    res.status(400).json({ error: 'That staff member cannot receive messages.' });
    return;
  }
  const message = await createStaffMessage(senderId, recipientId, body);
  if (!message) {
    res.status(500).json({ error: 'Could not send the message.' });
    return;
  }
  res.status(201).json({ message });
});

app.patch('/api/messages/:id/read', authMiddleware, async (req, res) => {
  const messageId = Number(req.params.id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    res.status(400).json({ error: 'Invalid message.' });
    return;
  }
  const ok = await markStaffMessageRead(messageId, req.user!.id);
  if (!ok) {
    res.status(404).json({ error: 'Message not found or already read.' });
    return;
  }
  res.json({ ok: true, unreadCount: await countStaffMessagesUnread(req.user!.id) });
});

app.post('/api/messages/read-all', authMiddleware, async (req, res) => {
  const updated = await markAllStaffMessagesRead(req.user!.id);
  res.json({ updated, unreadCount: await countStaffMessagesUnread(req.user!.id) });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (_req, res) => {
  res.json({ users: await listAllUsers() });
});

app.post('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const name = req.body.name ? String(req.body.name).trim() : null;
  const permissions = sanitizePermissions(
    Array.isArray(req.body.permissions) ? req.body.permissions.map(String) : [],
  );
  const processAssignments = sanitizeProcessStages(
    Array.isArray(req.body.processAssignments)
      ? req.body.processAssignments.map(String)
      : [],
  );
  let role: 'owner' | 'admin' | 'user';
  try {
    role = parseCreatedRole(req.body.role, req.user!.role);
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : OWNER_CREATE_ERROR });
    return;
  }

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Enter a valid email address' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const user = await createUserByAdmin(
      email,
      password,
      name,
      permissions,
      processAssignments,
      role,
      req.user!.role,
    );
    res.status(201).json({ message: `${user.email} created`, user: await publicUser(user) });
  } catch (err) {
    res.status(409).json({
      error: err instanceof Error ? err.message : 'Could not create user',
    });
  }
});

app.patch('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const name = req.body.name !== undefined ? String(req.body.name).trim() || null : undefined;
  const permissions =
    req.body.permissions !== undefined
      ? sanitizePermissions(Array.isArray(req.body.permissions) ? req.body.permissions.map(String) : [])
      : undefined;
  const processAssignments =
    req.body.processAssignments !== undefined
      ? sanitizeProcessStages(
          Array.isArray(req.body.processAssignments)
            ? req.body.processAssignments.map(String)
            : [],
        )
      : undefined;
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password && password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const user = await updateUserByAdmin(id, {
      name,
      permissions,
      processAssignments,
      password: password || undefined,
    }, req.user!.role);
    if (!user) {
      res.status(404).json({ error: 'User not found or cannot be modified' });
      return;
    }
    res.json({
      message: password ? `Password updated for ${user.email}` : 'User updated',
      user: await publicUser(user),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update user';
    res.status(message === OWNER_RESET_ADMIN_ERROR ? 403 : 400).json({ error: message });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'You cannot remove your own account' });
    return;
  }
  const result = await deleteUserById(id, req.user!.role);
  if (!result.ok) {
    res.status(400).json({ error: result.reason });
    return;
  }
  res.json({ message: 'User removed' });
});

app.get('/api/production/revision', authMiddleware, (_req, res) => {
  if (!usingPostgres()) {
    res.status(404).json({ error: 'PostgreSQL is not configured.' });
    return;
  }
  res.json({ revision: productionRevision() });
});

app.get('/api/production/snapshot', authMiddleware, (_req, res) => {
  if (!usingPostgres()) {
    res.status(404).json({ error: 'PostgreSQL is not configured.' });
    return;
  }
  res.json({ revision: productionRevision(), database: productionSnapshot() });
});

app.post('/api/production/mutate', authMiddleware, async (req, res) => {
  if (!usingPostgres()) {
    res.status(404).json({ error: 'PostgreSQL is not configured.' });
    return;
  }
  const name = String(req.body?.name ?? '');
  const args = Array.isArray(req.body?.args) ? req.body.args : null;
  const baseRevision = Number(req.body?.baseRevision);
  const mutation = PRODUCTION_MUTATIONS[name];
  if (!mutation || !args || !Number.isInteger(baseRevision) || baseRevision < 0) {
    res.status(400).json({ error: 'A valid production action is required.' });
    return;
  }
  const permissions = isAdminRole(req.user!.role) ? [] : await getUserPermissions(req.user!.id);
  const access = mutationAccess(mutation, args);
  if (!userMayMutate(req.user!.role, permissions, access)) {
    res.status(403).json({
      error: access === 'owner' ? OWNER_RESET_DATA_ERROR : 'You do not have permission for that action.',
    });
    return;
  }
  const adminApproval = mutation.adminApproval ? await readAdminApproval(req, name) : null;
  try {
    const saved = await runProductionMutation(
      name,
      args,
      { id: req.user!.id, email: req.user!.email, role: req.user!.role },
      baseRevision,
      adminApproval,
    );
    res.json({ ...saved, database: saved.snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The change could not be saved.';
    if (error instanceof AdminApprovalRequired) {
      res.status(403).json({ error: message, code: 'admin_approval_required' });
      return;
    }
    const status = error instanceof ProductionConflict ? 409 : 400;
    res.status(status).json({
      error: redactDatabaseUrl(message),
      revision: productionRevision(),
      database: status === 409 ? productionSnapshot() : undefined,
    });
  }
});

app.get('/api/production/backup', authMiddleware, adminMiddleware, async (_req, res) => {
  if (!usingPostgres()) {
    res.status(404).json({ error: 'PostgreSQL is not configured.' });
    return;
  }
  const backup = await exportProductionBackup();
  const stamp = backup.exportedAt.slice(0, 16).replace(/[-:T]/g, '');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="csc-distillery-backup-${stamp}.json"`);
  res.json(backup);
});

app.post('/api/production/restore', authMiddleware, adminMiddleware, async (req, res) => {
  if (!usingPostgres()) {
    res.status(404).json({ error: 'PostgreSQL is not configured.' });
    return;
  }
  try {
    const saved = await restoreProductionBackup(req.body, { id: req.user!.id, email: req.user!.email });
    res.json(saved);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? redactDatabaseUrl(error.message) : 'The backup could not be restored.' });
  }
});

app.delete('/api/production', authMiddleware, ownerMiddleware, async (req, res) => {
  if (!usingPostgres()) {
    res.status(404).json({ error: 'PostgreSQL is not configured.' });
    return;
  }
  const saved = await clearProductionData({ id: req.user!.id, email: req.user!.email });
  res.json(saved);
});

app.get('/api/production/audit', authMiddleware, adminMiddleware, async (_req, res) => {
  if (!usingPostgres()) {
    res.status(404).json({ error: 'PostgreSQL is not configured.' });
    return;
  }
  res.json({
    events: await listAuditEvents(),
    archived: await listArchivedAuditEvents(),
  });
});

async function start() {
  if (usingPostgres()) {
    await migrateDatabase();
    await archiveOldAuditEvents();
    await initProductionEngine();
  }
  await initializeAuthDatabase();
  await syncAdminFromEnv();

  if (isProduction) {
    const distPath = join(__dirname, '..', 'dist');

    app.use((req, res, next) => {
      if (req.path === '/' || req.path === '/index.html') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
      next();
    });
    app.use(express.static(distPath, { index: false, maxAge: '1y', immutable: true }));

    // SPA fallback: React Router routes work on direct refresh
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      // Missing hashed bundles must not return index.html (breaks dynamic import).
      if (req.path.startsWith('/assets/') || /\.(?:js|mjs|css|wasm|map|ico|png|jpg|jpeg|gif|webp|svg|woff2?)$/i.test(req.path)) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(join(distPath, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    next();
  });
  app.use(requestErrorHandler);

  app.listen(PORT, HOST, () => {
    const mode = isProduction ? 'production' : 'development';
    const store = usingPostgres() ? 'PostgreSQL' : 'SQLite';
    console.log(`Server listening on http://${HOST ?? 'localhost'}:${PORT} (${mode}, ${store})`);
    if (isProduction) {
      console.log('Serving frontend from dist/');
    } else {
      console.log(`Vite dev server expected at ${APP_URL ?? 'http://localhost:5173'}`);
    }
    if (APP_URL) console.log(`App URL: ${APP_URL}`);
  });
}

start().catch((error) => {
  const message = error instanceof Error ? error.message : 'Server failed to start';
  console.error(redactDatabaseUrl(message));
  process.exit(1);
});
