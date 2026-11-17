import { describe, expect, it } from 'vitest';
import { ginRecipeFieldsForDistillationSave } from './distillation-gin-recipe-save';

describe('ginRecipeFieldsForDistillationSave', () => {
  const recipes = [{ id: 3, name: 'House Gin' }];

  it('clears recipe fields for non-gin runs', () => {
    expect(ginRecipeFieldsForDistillationSave('wash', 3, 'House Gin', recipes)).toEqual({
      gin_recipe_id: null,
      gin_recipe_name: '',
    });
  });

  it('fills the recipe name from the saved recipe list when only the id is set', () => {
    expect(ginRecipeFieldsForDistillationSave('gin', 3, '', recipes)).toEqual({
      gin_recipe_id: 3,
      gin_recipe_name: 'House Gin',
    });
  });
});