import { describe, expect, it } from 'vitest';
import {
  scaleFactorFromTargetYield,
  scaleIngredients,
  scaleSpiritSources,
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
});
