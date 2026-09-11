import * as rc from '../recipes-queries';

/** Browser-local recipes repository (Phase 1C). Server implementation deferred to Step 1A+. */
export const recipesRepository = {
  lookups: {
    recipeTypes: rc.getRecipeTypes,
    addRecipeType: rc.addRecipeType,
  },
  recipes: {
    list: rc.getRecipes,
    get: rc.getRecipe,
    save: rc.saveRecipe,
    setStatus: rc.setRecipeStatus,
  },
  versions: {
    list: rc.getRecipeVersions,
    get: rc.getRecipeVersion,
    create: rc.createRecipeVersion,
    save: rc.saveRecipeVersion,
    clone: rc.cloneRecipeVersion,
    activate: rc.activateRecipeVersion,
    archive: rc.archiveRecipeVersion,
  },
  ingredients: {
    list: rc.getRecipeIngredients,
    save: rc.saveRecipeIngredient,
    delete: rc.deleteRecipeIngredient,
    insertDilutionWater: rc.insertDilutionWaterIngredient,
  },
  packaging: {
    list: rc.getRecipePackaging,
    save: rc.saveRecipePackaging,
    delete: rc.deleteRecipePackaging,
  },
};
