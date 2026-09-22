import { describe, expect, it } from 'vitest';
import {
  appendNutrientsToBatchNotes,
  formatRecipeNutrientLine,
  formatRecipeNutrientsSummary,
} from './wash-recipe-nutrients';
import type { RecipeNutrient } from '../types';

const sampleNutrients = (): RecipeNutrient[] => [
  {
    id: 1,
    recipe_id: 1,
    name: 'DAP',
    amount: 5,
    unit: 'lbs',
    inventory_item_id: 18,
    notes: '',
  },
  {
    id: 2,
    recipe_id: 1,
    name: 'Ammonium Sulphate',
    amount: 2,
    unit: 'lbs',
    inventory_item_id: 19,
    notes: '',
  },
];

describe('wash-recipe-nutrients', () => {
  it('formats nutrient lines and summary', () => {
    expect(formatRecipeNutrientLine({ amount: 5, unit: 'lbs', name: 'DAP' })).toBe('5.00 lbs DAP');
    expect(formatRecipeNutrientsSummary(sampleNutrients())).toBe(
      '5.00 lbs DAP; 2.00 lbs Ammonium Sulphate',
    );
  });

  it('appends nutrient block to batch notes once', () => {
    const withBase = appendNutrientsToBatchNotes('Start slow.', sampleNutrients());
    expect(withBase).toContain('Nutrients (from recipe):');
    expect(withBase).toContain('5.00 lbs DAP');
    expect(appendNutrientsToBatchNotes(withBase, sampleNutrients())).toBe(withBase);
  });
});
