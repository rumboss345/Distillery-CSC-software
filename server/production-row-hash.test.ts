import { describe, expect, it } from 'vitest';
import { hashRow } from './production-engine';

describe('production row hashes', () => {
  it('treats rounded floats as the same row', () => {
    expect(hashRow({ volume_gal: 80.1234564, abv: 75.4 })).toBe(
      hashRow({ volume_gal: 80.123456, abv: 75.4 }),
    );
  });

  it('does not treat a later date as the same row', () => {
    expect(hashRow({ updated_at: '2026-10-26 16:00:00' })).not.toBe(
      hashRow({ updated_at: '2026-10-26 16:00:01' }),
    );
  });
});
