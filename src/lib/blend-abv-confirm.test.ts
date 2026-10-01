import { describe, expect, it } from 'vitest';
import {
  abvMatchesTarget,
  computeRecipeTheoreticalAbv,
  ingredientsWithProofingWater,
  proofingWaterForRecipe,
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
    expect(result.abv!).toBeCloseTo(34.2, 0);
  });

  it('calculates proofing water that brings the recipe to the target proof', () => {
    const spirits = [{ spirit_label: 'High proof', volume_gal: 10, abv: 60 }];
    const sugar = [{ ingredient_type: 'sugar' as const, name: 'Sugar', amount: 0, unit: 'lbs', notes: '' }];
    const solved = proofingWaterForRecipe(spirits, sugar, 40);
    expect(solved).not.toBeNull();
    expect(solved!.waterGal).toBeCloseTo(5, 1);
    const withWater = ingredientsWithProofingWater(
      [{ ingredient_type: 'sugar', name: 'Sugar', amount: 2, unit: 'lbs', notes: '' }],
      solved!.waterGal,
    );
    expect(withWater[0]).toMatchObject({ ingredient_type: 'water', name: 'Proofing water', unit: 'gal' });
    expect(withWater[1]).toMatchObject({ ingredient_type: 'sugar', amount: 2 });
    const result = computeRecipeTheoreticalAbv(spirits, ingredientsWithProofingWater([], solved!.waterGal));
    expect(result.abv).toBeCloseTo(40, 0);
  });

  it('does not use water to raise proof above the undiluted blend', () => {
    expect(proofingWaterForRecipe(
      [{ spirit_label: 'Hearts', volume_gal: 10, abv: 40 }],
      [],
      50,
    )).toBeNull();
  });
});
