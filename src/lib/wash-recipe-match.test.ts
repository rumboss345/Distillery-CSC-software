import { describe, expect, it } from 'vitest';
import { findSavedWashRecipeByName } from './wash-recipe-match';
import type { RecipeView } from '../types';

const recipes: RecipeView[] = [
  {
    id: 1,
    name: 'Molasses Wash',
    spirit_type: 'Rum',
    grain_type: 'Molasses',
    grain_lbs: 400,
    water_gal: 500,
    yeast_strain: 'D-47',
    yeast_lbs: 2,
    target_brix: 18,
    target_final_brix: 0,
    notes: '',
    created_at: '',
    updated_at: '',
    nutrients: [],
  },
];

describe('findSavedWashRecipeByName', () => {
  it('finds a recipe by case-insensitive name', () => {
    expect(findSavedWashRecipeByName(recipes, ' molasses wash ')).toEqual(recipes[0]);
  });

  it('returns null when the name is empty or unknown', () => {
    expect(findSavedWashRecipeByName(recipes, '')).toBeNull();
    expect(findSavedWashRecipeByName(recipes, 'Custom one-off')).toBeNull();
  });
});
