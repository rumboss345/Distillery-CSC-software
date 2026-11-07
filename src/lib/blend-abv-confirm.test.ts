import { describe, expect, it } from 'vitest';
import {
  abvMatchesTarget,
  computeRecipeTheoreticalAbv,
  previewProofingWaterAdjustment,
  proofGapDescription,
  proofingWaterGalForTarget,
  reconcileRecipeProofingWater,
} from './blend-abv-confirm';
import { roundScaledAmount } from './blend-recipe-scale';
import { spiritVolumeGalFromAmount } from './blending';
import { designFormulation } from './formulation-engine';
import type { BlendIngredientInput, BlendIngredientType } from '../types';

const PROOFING_TEST_SPIRITS = [{ spirit_label: 'Spirit', volume_gal: 10, abv: 75 }];
const PROOFING_TARGET_ABV = 40;

const ADDITIVE_FIXTURES: Record<Exclude<BlendIngredientType, 'water'>, BlendIngredientInput> = {
  sugar: { ingredient_type: 'sugar', name: 'Sugar', amount: 50, unit: 'lbs', notes: '' },
  syrup: { ingredient_type: 'syrup', name: 'Syrup', amount: 3, unit: 'gal', notes: '' },
  flavoring: {
    ingredient_type: 'flavoring',
    name: 'Extract',
    amount: 1.5,
    unit: 'l',
    notes: '',
    abv: 35,
  },
  color: {
    ingredient_type: 'color',
    name: 'Caramel',
    amount: 0.25,
    unit: 'l',
    notes: '',
    density_assumption: 'class-i-caramel',
  },
  other: { ingredient_type: 'other', name: 'Glycerin', amount: 2, unit: 'lbs', notes: '' },
};

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
    expect(proofGapDescription(36.9, 35)).toBe('calculated ABV is 1.9% above the target');
    expect(proofGapDescription(33.1, 35)).toBe('calculated ABV is 1.9% below the target');
    expect(proofGapDescription(35.1, 35)).toBe('within 0.3% of the target');
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

  it('solves proofing water from entered spirit weight when volume_gal is zero', () => {
    const spirits = [{
      spirit_label: 'Spirit',
      volume_gal: 0,
      abv: 93,
      entered_amount: 0.25,
      entered_unit: 'lbs',
    }];
    const solved = proofingWaterGalForTarget(spirits, [], 40);
    expect('waterGal' in solved).toBe(true);
    if (!('waterGal' in solved)) return;
    expect(solved.waterGal).toBeGreaterThan(0);
  });

  it('writes a confirmed water charge at formulation precision and still meets the target', () => {
    const spirits = [{
      spirit_label: 'Neutral',
      volume_gal: spiritVolumeGalFromAmount(0.25, 'lbs', 93),
      abv: 93,
      entered_amount: 0.25,
      entered_unit: 'lbs',
    }];
    const flavor = { ingredient_type: 'flavoring' as const, name: 'YT75', amount: 1.75, unit: 'l', notes: '' };
    const preview = previewProofingWaterAdjustment(
      spirits,
      [{ ingredient_type: 'water', name: 'Proofing water', amount: 1, unit: 'lbs', notes: '' }, flavor],
      2,
    );
    expect('proposedAmount' in preview).toBe(true);
    if (!('proposedAmount' in preview)) return;
    const amount = roundScaledAmount(preview.proposedAmount);
    expect(String(amount).length).toBeLessThan(12);
    const after = computeRecipeTheoreticalAbv(spirits, [
      flavor,
      { ingredient_type: 'water', name: 'Proofing water', amount, unit: preview.unit, notes: '' },
    ]);
    expect(abvMatchesTarget(after.abv ?? 0, 2)).toBe(true);
  });

  it.each(Object.keys(ADDITIVE_FIXTURES) as Exclude<BlendIngredientType, 'water'>[])(
    'adjusts proofing water with a %s additive alone',
    (kind) => {
      const additive = ADDITIVE_FIXTURES[kind];
      const solved = proofingWaterGalForTarget(
        PROOFING_TEST_SPIRITS,
        [additive],
        PROOFING_TARGET_ABV,
      );
      expect('waterGal' in solved, `expected water solve for ${kind}, got ${JSON.stringify(solved)}`).toBe(true);
      if (!('waterGal' in solved)) return;
      const after = computeRecipeTheoreticalAbv(PROOFING_TEST_SPIRITS, [
        additive,
        {
          ingredient_type: 'water',
          name: 'Proofing water',
          amount: solved.waterGal,
          unit: 'gal',
          notes: '',
        },
      ]);
      expect(abvMatchesTarget(after.abv ?? 0, PROOFING_TARGET_ABV)).toBe(true);
    },
  );

  it('adjusts proofing water with every additive type in one batch', () => {
    const additives = Object.values(ADDITIVE_FIXTURES);
    const solved = proofingWaterGalForTarget(PROOFING_TEST_SPIRITS, additives, PROOFING_TARGET_ABV);
    expect('waterGal' in solved).toBe(true);
    if (!('waterGal' in solved)) return;
    const after = computeRecipeTheoreticalAbv(PROOFING_TEST_SPIRITS, [
      ...additives,
      { ingredient_type: 'water', name: 'Proofing water', amount: solved.waterGal, unit: 'gal', notes: '' },
    ]);
    expect(abvMatchesTarget(after.abv ?? 0, PROOFING_TARGET_ABV)).toBe(true);
  });

  it('adjusts proofing water when sugar, syrup, and flavoring are in the batch', () => {
    const spirits = [{ spirit_label: 'Rum', volume_gal: 88.29, abv: 93 }];
    const additives = [
      { ingredient_type: 'sugar' as const, name: 'Sugar', amount: 406, unit: 'lbs', notes: '' },
      { ingredient_type: 'syrup' as const, name: 'Simple syrup', amount: 5, unit: 'gal', notes: '' },
      { ingredient_type: 'flavoring' as const, name: 'Vanilla', amount: 2, unit: 'l', notes: '', abv: null },
    ];
    const solved = proofingWaterGalForTarget(spirits, additives, 35);
    expect('waterGal' in solved).toBe(true);
    if (!('waterGal' in solved)) return;
    expect(solved.waterGal).toBeGreaterThan(0);
    const after = computeRecipeTheoreticalAbv(spirits, [
      ...additives,
      { ingredient_type: 'water', name: 'Proofing water', amount: solved.waterGal, unit: 'gal', notes: '' },
    ]);
    expect(abvMatchesTarget(after.abv ?? 0, 35)).toBe(true);
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

  it('reconcileRecipeProofingWater replaces stale water on saved-style recipes', () => {
    const spirits = [{ spirit_label: 'Spiced base', volume_gal: 35.708, abv: 93.3 }];
    const ingredients = [
      { ingredient_type: 'sugar' as const, name: 'Sugar', amount: 80, unit: 'lbs', notes: '' },
      { ingredient_type: 'syrup' as const, name: 'CS1', amount: 15000, unit: 'ml', notes: '', density_assumption: 'cs1-syrup' as const },
      { ingredient_type: 'water' as const, name: 'Proofing water', amount: 86, unit: 'gal', notes: '' },
    ];
    const reconciled = reconcileRecipeProofingWater(spirits, ingredients, 35);
    const water = reconciled.find((row) => row.ingredient_type === 'water');
    expect(water).toBeDefined();
    expect(water!.amount).toBeLessThan(86);
    const result = computeRecipeTheoreticalAbv(spirits, reconciled);
    expect(abvMatchesTarget(result.abv ?? 0, 35)).toBe(true);
  });
});
