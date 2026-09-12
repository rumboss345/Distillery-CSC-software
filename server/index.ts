import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
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
  listPendingUsers,
  listProcessAssignmentsByStage,
  publicUser,
  rejectUserById,
  syncAdminFromEnv,
  updateUserByAdmin,
  type User,
} from './db.js';
import { sanitizePermissions, sanitizeProcessStages } from './permissions.js';
import { sendAdminApprovalEmail } from './email.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
  role: 'admin' | 'user';
}

function signToken(user: User) {
  const payload: AuthPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    const user = getUserById(payload.userId);
    if (!user || (user.role !== 'admin' && user.status !== 'approved')) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function adminMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
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
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
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
  if (getUserByEmail(email)) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const user = createUser(email, passwordHash, name);

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

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = getUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (user.role !== 'admin') {
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
  res.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

app.post('/api/auth/approve', (req, res) => {
  const token = String(req.body.token ?? req.query.token ?? '').trim();
  if (!token) {
    res.status(400).json({ error: 'Approval token is required' });
    return;
  }

  const user = approveUserByToken(token);
  if (!user) {
    res.status(404).json({ error: 'Invalid or expired approval link' });
    return;
  }

  res.json({
    message: `${user.email} has been approved. They can now sign in.`,
    user: publicUser(user),
  });
});

app.get('/api/admin/pending-users', authMiddleware, adminMiddleware, (_req, res) => {
  res.json({ users: listPendingUsers() });
});

app.post('/api/admin/users/:id/approve', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const user = approveUserById(id);
  if (!user) {
    res.status(404).json({ error: 'Pending user not found' });
    return;
  }
  res.json({ message: `${user.email} approved`, user: publicUser(user) });
});

app.post('/api/admin/users/:id/reject', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const user = rejectUserById(id);
  if (!user) {
    res.status(404).json({ error: 'Pending user not found' });
    return;
  }
  res.json({ message: `${user.email} rejected`, user: publicUser(user) });
});

app.get('/api/process/assignments', authMiddleware, (_req, res) => {
  res.json({ assignments: listProcessAssignmentsByStage() });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (_req, res) => {
  res.json({ users: listAllUsers() });
});

app.post('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
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
    const user = createUserByAdmin(email, password, name, permissions, processAssignments);
    res.status(201).json({ message: `${user.email} created`, user: publicUser(user) });
  } catch (err) {
    res.status(409).json({
      error: err instanceof Error ? err.message : 'Could not create user',
    });
  }
});

app.patch('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
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

  const user = updateUserByAdmin(id, { name, permissions, processAssignments });
  if (!user) {
    res.status(404).json({ error: 'User not found or cannot be modified' });
    return;
  }
  res.json({ message: 'User updated', user: publicUser(user) });
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'You cannot remove your own account' });
    return;
  }
  const result = deleteUserById(id);
  if (!result.ok) {
    res.status(400).json({ error: result.reason });
    return;
  }
  res.json({ message: 'User removed' });
});

initializeAuthDatabase();
syncAdminFromEnv();

if (isProduction) {
  const distPath = join(__dirname, '..', 'dist');

  app.use(express.static(distPath));

  // SPA fallback: React Router routes work on direct refresh
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(join(distPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.listen(PORT, HOST, () => {
  const mode = isProduction ? 'production' : 'development';
  console.log(`Server listening on http://${HOST ?? 'localhost'}:${PORT} (${mode})`);
  if (isProduction) {
    console.log(`Serving frontend from dist/`);
  } else {
    console.log(`Vite dev server expected at ${APP_URL ?? 'http://localhost:5173'}`);
  }
  if (APP_URL) {
    console.log(`App URL: ${APP_URL}`);
  }
});
