import { describe, expect, it } from 'vitest';
import {
  blendIngredientsWithSolvedProofingWater,
  computeTheoreticalBlend,
  type SpiritSourceInput,
} from './blend-formulation';
import type { BlendIngredientInput } from '../types';

const emptyWaterLine = (): BlendIngredientInput => ({
  ingredient_type: 'water',
  name: 'Proofing water',
  amount: 0,
  unit: 'gal',
  abv: null,
  cost_per_unit: null,
  lot_number: '',
  inventory_item_id: null,
  notes: '',
});

function waterGal(ingredients: BlendIngredientInput[]): number {
  return ingredients.find((row) => row.ingredient_type === 'water')?.amount ?? 0;
}

function finishedAbv(spirits: SpiritSourceInput[], ingredients: BlendIngredientInput[], target: number): number {
  const result = computeTheoreticalBlend(spirits, [
    {
      ingredientType: 'water',
      name: 'Proofing water',
      amount: waterGal(ingredients),
      unit: 'gal',
    },
  ], target);
  return result.abv;
}

describe('barrel leftover proofing', () => {
  it('matches Seven Fathoms-style leftover vs full-pull water', () => {
    const target = 40;
    const leftover: SpiritSourceInput[] = [{ volumeGal: 119.99, abv: 52 }];
    const pulls: SpiritSourceInput[] = [{ volumeGal: 212, abv: 52 }];
    const base = [emptyWaterLine()];
  const leftWater = waterGal(blendIngredientsWithSolvedProofingWater(base, leftover, target));
    const pullWater = waterGal(blendIngredientsWithSolvedProofingWater(base, pulls, target));
    expect(leftWater).toBeCloseTo(36.84, 1);
    expect(pullWater).toBeCloseTo(65.09, 1);
    expect(leftWater).toBeLessThan(pullWater);
  });

  it('solves water from leftover charge, not full barrel pulls', () => {
    const target = 40;
    const leftover: SpiritSourceInput[] = [{ volumeGal: 30, abv: 57.5 }];
    const pulls: SpiritSourceInput[] = [{ volumeGal: 95, abv: 61 }];
    const base = [emptyWaterLine()];
    const fromLeftover = blendIngredientsWithSolvedProofingWater(base, leftover, target);
    const fromPulls = blendIngredientsWithSolvedProofingWater(base, pulls, target);
    expect(waterGal(fromLeftover)).toBeLessThan(waterGal(fromPulls));
    expect(finishedAbv(leftover, fromLeftover, target)).toBeCloseTo(target, 0.35);
    expect(finishedAbv(leftover, fromPulls, target)).not.toBeCloseTo(target, 0.35);
  });
});
