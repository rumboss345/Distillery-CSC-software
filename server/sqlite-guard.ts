import type { NextFunction, Request, Response } from 'express';
import { usingPostgres } from './pg.js';

/** Whole-database uploads cannot replace PostgreSQL rows. */
export function blockSqliteWrite(_req: Request, res: Response, next: NextFunction): void {
  if (!usingPostgres()) {
    next();
    return;
  }
  res.status(409).json({ error: 'Production records are stored in PostgreSQL.' });
}
