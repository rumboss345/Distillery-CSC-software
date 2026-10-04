import { describe, expect, it } from 'vitest';
import {
  formatBatchSizeAmount,
  gallonsFromBatchSizeAmount,
  nearestSugarBagCount,
  scaleFactorForWholeSugarBags,
  scaleFactorFromTargetYield,
  scaleIngredients,
  scaleSpiritSources,
  sugarBagScaleIssue,
  sugarLbsAreWholeBags,
  totalSugarLbs,
} from './blend-recipe-scale';

describe('blend-recipe-scale', () => {
  it('scales spirit and ingredient amounts', () => {
    expect(scaleSpiritSources([{ spirit_label: 'High proof', volume_gal: 10, abv: 80 }], 2)[0].volume_gal).toBe(20);
    expect(scaleIngredients([{
      ingredient_type: 'water',
      name: 'Proofing water',
      amount: 5,
      unit: 'gal',
      cost_per_unit: null,
      lot_number: '',
      inventory_item_id: null,
      notes: '',
    }], 0.5)[0].amount).toBe(2.5);
  });

  it('derives scale factor from target yield', () => {
    expect(scaleFactorFromTargetYield(100, 150)).toBe(1.5);
    expect(scaleFactorFromTargetYield(0, 150)).toBe(1);
  });

  it('lets a batch size be entered in liters', () => {
    expect(formatBatchSizeAmount(0.3, 'gal')).toBe('0.3');
    expect(formatBatchSizeAmount(0.3, 'l')).toBe('1.136');
    expect(scaleFactorFromTargetYield(0.3, gallonsFromBatchSizeAmount(1.136, 'l'))).toBe(1);
    expect(scaleFactorFromTargetYield(0.3, gallonsFromBatchSizeAmount(1, 'l'))).toBe(0.881);
  });
});

describe('sugar bag batch sizes', () => {
  const darkBrown = { ingredient_type: 'sugar' as const, amount: 363, unit: 'lbs' };

  it('leaves recipes without sugar at the requested size', () => {
    expect(totalSugarLbs([{ ingredient_type: 'water', amount: 10, unit: 'gal' }])).toBe(0);
    expect(scaleFactorForWholeSugarBags(0, 1.37)).toBe(1.37);
    expect(sugarBagScaleIssue(0)).toBeNull();
  });

  it('snaps a sugared recipe to whole 50 lb bags', () => {
    expect(totalSugarLbs([darkBrown])).toBe(363);
    expect(nearestSugarBagCount(363)).toBe(7);
    const factor = scaleFactorForWholeSugarBags(363, 1);
    expect(factor * 363).toBeCloseTo(350, 6);
    expect(sugarLbsAreWholeBags(factor * 363)).toBe(true);
    expect(sugarBagScaleIssue(363)).toMatch(/7 bags \(350 lb\)/);
    expect(sugarBagScaleIssue(350)).toBeNull();
  });

  it('steps a larger batch to the nearest bag count', () => {
    expect(nearestSugarBagCount(363 * 2)).toBe(15);
    expect(scaleFactorForWholeSugarBags(363, 2) * 363).toBeCloseTo(750, 6);
  });
});
