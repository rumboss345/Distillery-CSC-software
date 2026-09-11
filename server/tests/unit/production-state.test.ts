import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isBrowserAuthoritative,
  isServerAuthoritative,
  PRODUCTION_STATE_MESSAGES,
} from '../../../shared/production-state.js';

describe('production migration state machine', () => {
  it('browser is authoritative before cutover states', () => {
    for (const state of ['LOCAL_ONLY', 'MIGRATION_READY', 'MIGRATION_IMPORTED', 'SERVER_READ_ONLY_VALIDATION'] as const) {
      assert.equal(isBrowserAuthoritative(state), true);
      assert.equal(isServerAuthoritative(state), false);
    }
  });

  it('server is authoritative only after SERVER_AUTHORITATIVE', () => {
    assert.equal(isServerAuthoritative('SERVER_AUTHORITATIVE'), true);
    assert.equal(isBrowserAuthoritative('SERVER_AUTHORITATIVE'), false);
  });

  it('MIGRATION_IMPORTED message warns cutover has not occurred', () => {
    assert.match(
      PRODUCTION_STATE_MESSAGES.MIGRATION_IMPORTED,
      /cutover has NOT occurred/i,
    );
  });
});
