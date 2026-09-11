import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

/**
 * Mirrors client assertLocalWriteAllowed / production-mode behavior (requirement J).
 * When server is authoritative, local production writes must be blocked.
 */
describe('production write guard', () => {
  const KEY = 'csc-production-mode-cache';

  beforeEach(() => {
    // Node test environment has no sessionStorage; simulate with global
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem(k: string) {
        return (this as { _data?: Record<string, string> })._data?.[k] ?? null;
      },
      setItem(k: string, v: string) {
        (this as { _data?: Record<string, string> })._data = {
          ...(this as { _data?: Record<string, string> })._data,
          [k]: v,
        };
      },
      removeItem(k: string) {
        const data = (this as { _data?: Record<string, string> })._data;
        if (data) delete data[k];
      },
      clear() {
        (this as { _data?: Record<string, string> })._data = {};
      },
      key: () => null,
      length: 0,
    } as Storage;
  });

  afterEach(() => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  function canWriteToLocal(): boolean {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return true;
    const status = JSON.parse(raw) as { serverAuthoritative?: boolean; migrationState?: string };
    if (status.serverAuthoritative || status.migrationState === 'SERVER_AUTHORITATIVE') {
      return false;
    }
    return true;
  }

  it('allows writes when browser is authoritative', () => {
    sessionStorage.setItem(KEY, JSON.stringify({
      migrationState: 'MIGRATION_IMPORTED',
      serverAuthoritative: false,
      browserAuthoritative: true,
    }));
    assert.equal(canWriteToLocal(), true);
  });

  it('blocks writes after SERVER_AUTHORITATIVE cutover', () => {
    sessionStorage.setItem(KEY, JSON.stringify({
      migrationState: 'SERVER_AUTHORITATIVE',
      serverAuthoritative: true,
      browserAuthoritative: false,
    }));
    assert.equal(canWriteToLocal(), false);
  });
});
