import { describe, expect, it } from 'vitest';
import {
  abvFromUsProof,
  abvMatchesTarget,
  computeRecipeTheoreticalAbv,
  usProofFromAbv,
} from './blend-abv-confirm';

describe('blend-abv-confirm', () => {
  it('converts US proof into the target ABV', () => {
    expect(abvFromUsProof(80)).toBe(40);
    expect(abvFromUsProof(75)).toBe(37.5);
    expect(abvFromUsProof(70.5)).toBe(35.3);
    expect(abvFromUsProof(0)).toBeNull();
    expect(abvFromUsProof(200)).toBeNull();
    expect(usProofFromAbv(40)).toBe(80);
    expect(usProofFromAbv(37.5)).toBe(75);
  });

  it('detects when calculated ABV matches target within tolerance', () => {
    expect(abvMatchesTarget(34.2, 34)).toBe(true);
    expect(abvMatchesTarget(34.2, 35)).toBe(false);
  });

  it('calculates recipe ABV from spirits and additives', () => {
    const result = computeRecipeTheoreticalAbv(
      [{ spirit_label: '93% rum', volume_gal: 88.29, abv: 93 }],
      [
        { ingredient_type: 'water', name: 'Water', amount: 120.38, unit: 'gal', notes: '' },
        { ingredient_type: 'sugar', name: 'Sugar', amount: 406, unit: 'lbs', notes: '' },
      ],
    );
    expect(result.abv).not.toBeNull();
    expect(result.abv!).toBeCloseTo(34.2, 0);
  });
});
