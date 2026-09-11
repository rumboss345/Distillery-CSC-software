import type { RecipesRepository } from '../../types/recipes';
import * as rc from '../recipes-queries';

/** Browser-local recipes repository (Phase 1C). Server implementation deferred to Step 1A+. */
export const recipesRepository: RecipesRepository = {
  listRecipes: rc.getRecipes,
  getRecipe: rc.getRecipe,
  saveRecipe: rc.saveRecipe,
  setRecipeActive: rc.setRecipeStatus,
  listVersions: rc.getRecipeVersions,
  getVersion: rc.getRecipeVersion,
  createVersion: rc.createRecipeVersion,
  cloneVersion: rc.cloneRecipeVersion,
  saveVersion: rc.saveRecipeVersion,
  activateVersion: rc.activateRecipeVersion,
  archiveVersion: rc.archiveRecipeVersion,
  listIngredients: rc.getRecipeIngredients,
  saveIngredient: rc.saveRecipeIngredient,
  removeDraftIngredient: rc.deleteRecipeIngredient,
  listPackaging: rc.getRecipePackaging,
  savePackagingItem: rc.saveRecipePackaging,
  removeDraftPackaging: rc.deleteRecipePackaging,
  listSteps: rc.getRecipeSteps,
  saveStep: rc.saveRecipeStep,
  reorderSteps: rc.reorderRecipeSteps,
  removeDraftStep: rc.deleteRecipeStep,
  insertDilutionWater: rc.insertDilutionWaterIngredient,
  lookups: {
    recipeTypes: rc.getRecipeTypes,
    addRecipeType: rc.addRecipeType,
  },
};
