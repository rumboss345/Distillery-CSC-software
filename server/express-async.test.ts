import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { asyncHandler, formatServerError, requestErrorHandler } from './express-async';

describe('asyncHandler', () => {
  it('forwards rejected promises to next', async () => {
    const boom = new Error('route failed');
    const handler = asyncHandler(async () => {
      throw boom;
    });
    const next = vi.fn();
    const res = { headersSent: false, status: vi.fn(), json: vi.fn() } as unknown as Response;
    handler({ method: 'GET', path: '/test' } as Request, res, next as NextFunction);
    await Promise.resolve();
    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe('requestErrorHandler', () => {
  it('returns a JSON error without throwing', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { headersSent: false, status } as unknown as Response;
    const next = vi.fn();
    requestErrorHandler(new Error('secret postgres://user:pass@host/db'), { method: 'POST', path: '/api/x' } as Request, res, next);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: expect.stringMatching(/postgres:\/\/\*\*\*/) });
    expect(formatServerError(new Error('plain'))).toBe('plain');
  });
});
