import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  browserWritesAllowed,
  dualValidationEnabled,
  parseDatabaseMode,
  serverWritesRequired,
} from '../../../shared/database-mode.js';

describe('Step 1A database mode', () => {
  it('defaults to browser_local', () => {
    assert.equal(parseDatabaseMode(undefined), 'browser_local');
    assert.equal(parseDatabaseMode(''), 'browser_local');
  });

  it('parses dual_validation and postgres_authoritative', () => {
    assert.equal(parseDatabaseMode('dual_validation'), 'dual_validation');
    assert.equal(parseDatabaseMode('postgres_authoritative'), 'postgres_authoritative');
  });

  it('browser writes allowed except postgres_authoritative or SERVER_AUTHORITATIVE', () => {
    assert.equal(browserWritesAllowed('browser_local', 'MIGRATION_IMPORTED'), true);
    assert.equal(browserWritesAllowed('dual_validation', 'MIGRATION_IMPORTED'), true);
    assert.equal(browserWritesAllowed('postgres_authoritative', 'MIGRATION_IMPORTED'), false);
    assert.equal(browserWritesAllowed('browser_local', 'SERVER_AUTHORITATIVE'), false);
  });

  it('server writes required after cutover or postgres_authoritative mode', () => {
    assert.equal(serverWritesRequired('browser_local', 'MIGRATION_IMPORTED'), false);
    assert.equal(serverWritesRequired('postgres_authoritative', 'MIGRATION_IMPORTED'), true);
    assert.equal(serverWritesRequired('browser_local', 'SERVER_AUTHORITATIVE'), true);
  });

  it('dual validation only in dual_validation mode', () => {
    assert.equal(dualValidationEnabled('browser_local'), false);
    assert.equal(dualValidationEnabled('dual_validation'), true);
    assert.equal(dualValidationEnabled('postgres_authoritative'), false);
  });
});
