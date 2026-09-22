import { describe, expect, it } from 'vitest';
import {
  formatMashBatchNutrientsSummary,
  formatRecipeNutrientLine,
  formatRecipeNutrientsSummary,
  recipeNutrientsToBatchInputs,
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
  it('formats nutrient lines like yeast-style lbs', () => {
    expect(formatRecipeNutrientLine({ amount: 5, name: 'DAP' })).toBe('DAP (5.00 lbs)');
    expect(formatRecipeNutrientsSummary(sampleNutrients())).toBe(
      'DAP (5.00 lbs), Ammonium Sulphate (2.00 lbs)',
    );
  });

  it('maps recipe nutrients to batch inputs', () => {
    expect(recipeNutrientsToBatchInputs(sampleNutrients())).toEqual([
      { name: 'DAP', lbs: 5 },
      { name: 'Ammonium Sulphate', lbs: 2 },
    ]);
    expect(formatMashBatchNutrientsSummary([
      { name: 'DAP', lbs: 5 },
      { name: 'Ammonium Sulphate', lbs: 2 },
    ])).toBe('DAP (5.00 lbs), Ammonium Sulphate (2.00 lbs)');
  });
});
