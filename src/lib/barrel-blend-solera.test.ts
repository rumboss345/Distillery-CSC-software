import { describe, expect, it } from 'vitest';
import {
  emptyBarrelBlendSoleraState,
  mergeBarrelSoleraIntoNotes,
  parseBarrelSoleraFromNotes,
  theoreticalBlendFromSources,
  totalSoleraReturnGal,
  volumeGalFromCheckpoint,
} from './barrel-blend-solera';

describe('theoreticalBlendFromSources', () => {
  it('volume-weights ABV across pulls', () => {
    const blend = theoreticalBlendFromSources([
      { volume_gal: 10, abv: 60 },
      { volume_gal: 20, abv: 50 },
    ]);
    expect(blend.volumeGal).toBe(30);
    expect(blend.abv).toBeCloseTo(53.333, 2);
  });
});

describe('barrel solera notes', () => {
  it('round-trips through blend notes', () => {
    const state = {
      ...emptyBarrelBlendSoleraState(),
      preProofComplete: true,
      initial: { measureMode: 'volume' as const, volumeGal: 40, abv: 58 },
      remainder: { measureMode: 'volume' as const, volumeGal: 32, abv: 57.5 },
      returns: [{ barrel_id: 3, volume_gal: 8, abv: 58 }],
    };
    const notes = mergeBarrelSoleraIntoNotes('Tasted oak-forward.', state);
    const parsed = parseBarrelSoleraFromNotes(notes);
    expect(parsed?.preProofComplete).toBe(true);
    expect(parsed?.returns).toHaveLength(1);
    expect(notes).toContain('Tasted oak-forward.');
  });
});

describe('solera totals', () => {
  it('sums return gallons', () => {
    expect(totalSoleraReturnGal([
      { barrel_id: 1, volume_gal: 5, abv: 60 },
      { barrel_id: 2, volume_gal: 3.5, abv: 60 },
    ])).toBe(8.5);
  });

  it('converts weight checkpoints to volume', () => {
    const gal = volumeGalFromCheckpoint({
      measureMode: 'weight',
      weightLbs: 100,
      abv: 50,
    });
    expect(gal).toBeGreaterThan(0);
  });
});
