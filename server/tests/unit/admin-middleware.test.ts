import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type express from 'express';
import { adminMiddleware } from '../../middleware/auth.js';
import type { User } from '../../db/auth.js';

function mockRes() {
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
    get statusCode() { return statusCode; },
    get body() { return body; },
  } as express.Response & { statusCode: number; body: unknown };
  return res;
}

describe('adminMiddleware', () => {
  it('I: rejects non-admin users for migration endpoints', () => {
    const req = { user: { role: 'user' } as User } as express.Request;
    const res = mockRes();
    let nextCalled = false;
    adminMiddleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Admin access required' });
  });

  it('allows admin users', () => {
    const req = { user: { role: 'admin' } as User } as express.Request;
    const res = mockRes();
    let nextCalled = false;
    adminMiddleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});
