import { describe, expect, it } from 'vitest';
import {
  adjacentSugarBagLbs,
  formatBatchSizeAmount,
  gallonsFromBatchSizeAmount,
  nearestSugarBagCount,
  scaleFactorForWholeSugarBags,
  scaleFactorFromTargetYield,
  scaleIngredients,
  scaleSpiritSources,
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
    expect(formatBatchSizeAmount(0.3, 'gal')).toBe('0.300');
    expect(formatBatchSizeAmount(0.3, 'l')).toBe('1.136');
    expect(scaleFactorFromTargetYield(0.3, gallonsFromBatchSizeAmount(1.136, 'l'))).toBe(1);
    expect(scaleFactorFromTargetYield(0.3, gallonsFromBatchSizeAmount(1, 'l'))).toBeCloseTo((1 / 3.785411784) / 0.3, 5);
  });
});

describe('sugar bag batch sizes', () => {
  const darkBrown = { ingredient_type: 'sugar' as const, amount: 363, unit: 'lbs' };

  it('leaves recipes without sugar at the requested size', () => {
    expect(totalSugarLbs([{ ingredient_type: 'water', amount: 10, unit: 'gal' }])).toBe(0);
    expect(scaleFactorForWholeSugarBags(0, 1.37)).toBe(1.37);
    expect(sugarLbsAreWholeBags(0)).toBe(true);
  });

  it('snaps a sugared recipe to whole 50 lb bags', () => {
    expect(totalSugarLbs([darkBrown])).toBe(363);
    expect(nearestSugarBagCount(363)).toBe(7);
    const factor = scaleFactorForWholeSugarBags(363, 1);
    expect(factor * 363).toBeCloseTo(350, 6);
    expect(sugarLbsAreWholeBags(factor * 363)).toBe(true);
    expect(sugarLbsAreWholeBags(363)).toBe(false);
    expect(sugarLbsAreWholeBags(350)).toBe(true);
  });

  it('steps a larger batch to the nearest bag count', () => {
    expect(nearestSugarBagCount(363 * 2)).toBe(15);
    expect(scaleFactorForWholeSugarBags(363, 2) * 363).toBeCloseTo(750, 6);
  });

  it('steps off a partial bag to the whole bags on either side', () => {
    expect(adjacentSugarBagLbs(363)).toEqual({ fewerLbs: 350, moreLbs: 400 });
    expect(adjacentSugarBagLbs(350)).toEqual({ fewerLbs: 300, moreLbs: 400 });
    expect(adjacentSugarBagLbs(10)).toEqual({ fewerLbs: 0, moreLbs: 50 });
  });
});
