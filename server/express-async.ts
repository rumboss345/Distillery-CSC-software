import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { redactDatabaseUrl } from './pg.js';

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;

/** Sends async route failures to Express error handling instead of crashing the process. */
export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function formatServerError(error: unknown): string {
  if (error instanceof Error) return redactDatabaseUrl(error.message);
  return 'Something went wrong.';
}

export function requestErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  console.error(`HTTP ${req.method} ${req.path} failed:`, error);
  res.status(500).json({ error: formatServerError(error) });
}

/** Log stray promise failures; route handlers should use asyncHandler instead. */
export function installProcessErrorHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
  });
}
