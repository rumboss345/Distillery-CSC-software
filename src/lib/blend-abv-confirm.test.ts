import { describe, expect, it } from 'vitest';
import { designFormulation } from './formulation-engine';
import {
  abvMatchesTarget,
  computeRecipeTheoreticalAbv,
  proofGapDescription,
  proofingWaterGalForTarget,
} from './blend-abv-confirm';

describe('blend-abv-confirm', () => {
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
    expect(result.volumeGal).toBeGreaterThan(200);
    expect(result.abv!).toBeGreaterThan(30);
    expect(result.abv!).toBeLessThan(40);
  });

  it('describes the calculated proof against the target, not the other way around', () => {
    expect(proofGapDescription(36.9, 35)).toBe('calculated is 1.9% above the target');
    expect(proofGapDescription(33.1, 35)).toBe('calculated is 1.9% below the target');
    expect(proofGapDescription(35.1, 35)).toBe('matches within 0.3%');
  });

  it('sets proofing water so a 0.2 gal 36.9% pull reaches a 35% target', () => {
    const spirits = [{ spirit_label: 'Spirit', volume_gal: 0.2, abv: 36.9 }];
    const solved = proofingWaterGalForTarget(spirits, [], 35);
    expect('waterGal' in solved).toBe(true);
    if (!('waterGal' in solved)) return;
    const result = computeRecipeTheoreticalAbv(spirits, [
      { ingredient_type: 'water', name: 'Proofing water', amount: solved.waterGal, unit: 'gal', notes: '' },
    ]);
    expect(abvMatchesTarget(result.abv!, 35)).toBe(true);
    expect(result.volumeGal!).toBeGreaterThan(0.2);
  });

  it('agrees with a blend the designer solved to a target', () => {
    const designed = designFormulation({
      targetVolumeGal: 0.2,
      targetAbv: 35,
      additionSpiritAbv: 93,
    });
    expect(designed.ok).toBe(true);
    const result = computeRecipeTheoreticalAbv(
      [{ spirit_label: 'Spirit', volume_gal: designed.spiritGal, abv: designed.spiritAbv }],
      [{ ingredient_type: 'water', name: 'Proofing water', amount: designed.waterGal, unit: 'gal', notes: '' }],
    );
    expect(abvMatchesTarget(result.abv!, 35)).toBe(true);
    expect(abvMatchesTarget(designed.analysis?.abv ?? 0, 35)).toBe(true);
  });
});
