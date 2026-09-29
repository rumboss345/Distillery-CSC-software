import { describe, expect, it } from 'vitest';
import {
  formatMashBatchNutrientsSummary,
  formatRecipeNutrientLine,
  formatRecipeNutrientsSummary,
  normalizeNutrientUnit,
  nutrientAmountInUnit,
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
      { name: 'DAP', amount: 5, unit: 'lbs' },
      { name: 'Ammonium Sulphate', amount: 2, unit: 'lbs' },
    ]);
    expect(formatMashBatchNutrientsSummary([
      { name: 'DAP', amount: 5, unit: 'lbs' },
      { name: 'Ammonium Sulphate', amount: 2, unit: 'lbs' },
    ])).toBe('DAP (5.00 lbs), Ammonium Sulphate (2.00 lbs)');
  });

  it('formats weight and volume units', () => {
    expect(formatRecipeNutrientLine({ amount: 250, name: 'DAP', unit: 'g' })).toBe('DAP (250.0 grams)');
    expect(formatRecipeNutrientLine({ amount: 1.5, name: 'Enzyme', unit: 'l' })).toBe('Enzyme (1.50 L)');
    expect(formatRecipeNutrientsSummary([
      { ...sampleNutrients()[0], amount: 500, unit: 'ml' },
    ])).toBe('DAP (500.0 ml)');
  });

  it('keeps the chosen unit when a recipe is loaded onto a wash', () => {
    const nutrients = sampleNutrients();
    nutrients[0].unit = 'kg';
    nutrients[1].unit = 'ml';
    expect(recipeNutrientsToBatchInputs(nutrients)).toEqual([
      { name: 'DAP', amount: 5, unit: 'kg' },
      { name: 'Ammonium Sulphate', amount: 2, unit: 'ml' },
    ]);
  });

  it('normalizes measurement names', () => {
    expect(normalizeNutrientUnit('grams')).toBe('g');
    expect(normalizeNutrientUnit('L')).toBe('l');
    expect(normalizeNutrientUnit('OZ')).toBe('oz');
    expect(normalizeNutrientUnit('')).toBe('lbs');
  });

  it('converts nutrient amounts between weight and volume units', () => {
    expect(nutrientAmountInUnit(1, 'kg', 'lbs')).toBeCloseTo(2.20462, 4);
    expect(nutrientAmountInUnit(16, 'oz', 'lbs')).toBeCloseTo(1, 4);
    expect(nutrientAmountInUnit(1000, 'g', 'kg')).toBeCloseTo(1, 4);
    expect(nutrientAmountInUnit(1, 'l', 'ml')).toBeCloseTo(1000, 4);
    expect(nutrientAmountInUnit(453.59237, 'ml', 'lbs')).toBeCloseTo(1, 4);
    expect(nutrientAmountInUnit(5, 'lbs', 'lbs')).toBe(5);
  });
});
