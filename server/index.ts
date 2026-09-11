import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  approveUserById,
  approveUserByToken,
  createUser,
  getUserByEmail,
  listPendingUsers,
  publicUser,
  rejectUserById,
} from './db/auth.js';
import { isDatabaseConfigured, pingDatabase } from './db/pool.js';
import { APP_URL, HOST, PORT, isProduction, JWT_SECRET } from './config.js';
import { sendAdminApprovalEmail } from './email.js';
import { adminMiddleware, authMiddleware, signToken } from './middleware/auth.js';
import productionRoutes from './routes/production.js';
import { initializeServerDatastores } from './startup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (isProduction && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET environment variable is required in production.');
  process.exit(1);
}

if (isProduction && !process.env.APP_URL) {
  console.warn(
    'APP_URL is not set. Approval email links may be incorrect. Set APP_URL to your Render service URL.',
  );
}

void JWT_SECRET;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', async (_req, res) => {
  const dbOk = isDatabaseConfigured() ? await pingDatabase() : false;
  res.json({
    ok: true,
    databaseConfigured: isDatabaseConfigured(),
    databaseConnected: dbOk,
  });
});

app.use('/api/production', productionRoutes);

app.post('/api/auth/register', async (req, res) => {
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'Server database is not configured' });
    return;
  }

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

  const passwordHash = bcrypt.hashSync(password, 12);
  const user = await createUser(email, passwordHash, name);

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
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'Server database is not configured' });
    return;
  }

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
    user: publicUser(user),
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
  res.json({ message: `${user.email} approved`, user: publicUser(user) });
});

app.post('/api/admin/users/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const user = await rejectUserById(id);
  if (!user) {
    res.status(404).json({ error: 'Pending user not found' });
    return;
  }
  res.json({ message: `${user.email} rejected`, user: publicUser(user) });
});

if (isProduction) {
  const distPath = join(__dirname, '..', 'dist');

  app.use(express.static(distPath));

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

await initializeServerDatastores();

app.listen(PORT, HOST, () => {
  const mode = isProduction ? 'production' : 'development';
  console.log(`Server listening on http://${HOST ?? 'localhost'}:${PORT} (${mode})`);
  if (isProduction) {
    console.log('Serving frontend from dist/');
  } else if (APP_URL) {
    console.log(`Vite dev server expected at ${APP_URL}`);
  }
  if (APP_URL) {
    console.log(`App URL: ${APP_URL}`);
  }
});
