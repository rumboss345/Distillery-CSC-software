import { describe, expect, it } from 'vitest';
import {
  barrelBlendAngelShareGal,
  barrelBlendReviewRows,
  blendCheckAbv,
  barrelProofingSpiritSources,
  expectedRemainderAfterSolera,
  syncSoleraReturnsToBlendCheck,
  convertBarrelCheckDraftMeasure,
  syncBarrelCheckDraftAlternate,
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

describe('barrelBlendAngelShareGal', () => {
  it('records verification loss between initial, solera, and leftover', () => {
    const loss = barrelBlendAngelShareGal({
      initial: { measureMode: 'volume', volumeGal: 40, abv: 58 },
      remainder: { measureMode: 'volume', volumeGal: 30, abv: 57 },
      returns: [{ barrel_id: 1, volume_gal: 8, abv: 58 }],
    });
    expect(loss).toBe(2);
  });

  it('returns zero when volumes reconcile', () => {
    const loss = barrelBlendAngelShareGal({
      initial: { measureMode: 'volume', volumeGal: 40, abv: 58 },
      remainder: { measureMode: 'volume', volumeGal: 32, abv: 57 },
      returns: [{ barrel_id: 1, volume_gal: 8, abv: 58 }],
    });
    expect(loss).toBe(0);
  });
});

describe('barrel check measure toggle', () => {
  const draft = { volume: '200', weight: '', abv: '52', tempF: '60' };

  it('syncs weight when volume is primary', () => {
    const synced = syncBarrelCheckDraftAlternate(draft, 'volume');
    expect(parseFloat(synced.weight)).toBeGreaterThan(900);
    expect(synced.volume).toBe('200');
  });

  it('converts volume to weight when switching to weight mode', () => {
    const converted = convertBarrelCheckDraftMeasure(draft, 'volume', 'weight');
    expect(converted.volume).toBe('200');
    expect(parseFloat(converted.weight)).toBeGreaterThan(900);
    const back = convertBarrelCheckDraftMeasure({ ...draft, ...converted }, 'weight', 'volume');
    expect(parseFloat(back.volume)).toBeCloseTo(200, 1);
  });
});

describe('solera and remainder carry-forward', () => {
  it('solera uses blend-check abv', () => {
    const initial = { measureMode: 'volume' as const, volumeGal: 200, abv: 52, tempF: 68 };
    expect(blendCheckAbv(initial)).toBe(52);
    const synced = syncSoleraReturnsToBlendCheck(initial, [
      { barrel_id: 1, volume_gal: 52, abv: 48 },
    ]);
    expect(synced[0].abv).toBe(52);
  });

  it('prefills leftover volume after solera', () => {
    const initial = { measureMode: 'volume' as const, volumeGal: 200, abv: 52, tempF: 60 };
    const book = expectedRemainderAfterSolera(initial, [
      { barrel_id: 1, volume_gal: 52, abv: 52 },
    ]);
    expect(book.volumeGal).toBe(148);
    expect(book.abv).toBe(52);
    expect(book.tempF).toBe(60);
    expect(book.weightLbs).toBeGreaterThan(0);
  });
});

describe('barrelProofingSpiritSources', () => {
  it('uses leftover volume and corrected abv after pre-proof', () => {
    const sources = barrelProofingSpiritSources({
      ...emptyBarrelBlendSoleraState(),
      remainder: { measureMode: 'volume', volumeGal: 28.5, abv: 58, tempF: 68 },
      preProofComplete: true,
    });
    expect(sources).toHaveLength(1);
    expect(sources[0].volumeGal).toBe(28.5);
    expect(sources[0].abv).toBeCloseTo(56.45, 2);
  });
});

describe('barrelBlendReviewRows', () => {
  it('lists pulls, vat, solera, angel share, and proofing charge', () => {
    const rows = barrelBlendReviewRows(
      [{ label: 'Pull B-1', volumeGal: 40, abv: 60 }],
      [{ label: 'Top B-2', volumeGal: 8, abv: 58 }],
      {
        ...emptyBarrelBlendSoleraState(),
        initial: { measureMode: 'volume', volumeGal: 39.5, abv: 59 },
        remainder: { measureMode: 'volume', volumeGal: 30, abv: 57.5 },
        returns: [{ barrel_id: 2, volume_gal: 8, abv: 58 }],
        angel_share_gal: 1.5,
        preProofComplete: true,
      },
    );
    expect(rows.map((r) => r.kind)).toEqual([
      'pull',
      'vat',
      'solera',
      'angel_share',
      'proof_charge',
    ]);
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
