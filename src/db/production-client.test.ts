import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureProductionBridge,
  invokeProductionMutation,
  mutationSnapshot,
} from './production-client';

describe('production mutation snapshots', () => {
  it('uses snapshot from a successful save, then database from a conflict', () => {
    expect(mutationSnapshot({ snapshot: 'after-lab-test' })).toBe('after-lab-test');
    expect(mutationSnapshot({ database: 'after-conflict' })).toBe('after-conflict');
    expect(mutationSnapshot({ snapshot: 'preferred', database: 'older' })).toBe('preferred');
    expect(mutationSnapshot({})).toBeUndefined();
  });
});

describe('production mutation client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockXhr(status: number, body: unknown) {
    vi.stubGlobal('localStorage', {
      getItem: () => 'test-token',
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    class FakeXHR {
      status = 0;
      responseText = '';
      open() {}
      setRequestHeader() {}
      send() {
        this.status = status;
        this.responseText = JSON.stringify(body);
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
  }

  it('adopts the snapshot after a successful blend save so produce is not stale', () => {
    let revision = 10;
    const applied: Array<{ snapshot: string; revision: number }> = [];
    configureProductionBridge({
      revision: () => revision,
      apply: (snapshot, next) => {
        applied.push({ snapshot, revision: next });
        revision = next;
      },
      notify: () => {
        throw new Error('A successful save should not look like someone else edited the row.');
      },
    });
    mockXhr(200, { result: 44, revision: 11, snapshot: 'overproof-draft' });

    expect(invokeProductionMutation('saveBlendFormula', [{ product_name: 'GR Overproof' }])).toBe(44);
    expect(applied).toEqual([{ snapshot: 'overproof-draft', revision: 11 }]);
    expect(revision).toBe(11);
  });

  it('adopts a database field when that is what the reply includes', () => {
    let revision = 4;
    configureProductionBridge({
      revision: () => revision,
      apply: (_snapshot, next) => {
        revision = next;
      },
      notify: () => undefined,
    });
    mockXhr(200, { result: 8, revision: 5, database: 'legacy-success' });

    expect(invokeProductionMutation('saveBlendFormula', [])).toBe(8);
    expect(revision).toBe(5);
  });
});
