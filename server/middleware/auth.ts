import type express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { getUserById, type User } from '../db/auth.js';

export interface AuthPayload {
  userId: number;
  email: string;
  role: 'admin' | 'user';
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function signToken(user: User) {
  const payload: AuthPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export async function authMiddleware(
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
    const user = await getUserById(payload.userId);
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

export function adminMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
