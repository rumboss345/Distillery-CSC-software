import { describe, expect, it } from 'vitest';
import { isStaleClientChunkError } from './client-asset-reload';

describe('isStaleClientChunkError', () => {
  it('detects missing dynamic import chunks after deploy', () => {
    expect(
      isStaleClientChunkError(new Error('Failed to fetch dynamically imported module: https://example.com/assets/foo.js')),
    ).toBe(true);
    expect(isStaleClientChunkError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isStaleClientChunkError(new Error('Network request failed'))).toBe(false);
  });
});
