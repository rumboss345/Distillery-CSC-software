import type { RecipeView } from '../types';

/** Saved wash recipe with the same name as the batch (case-insensitive), if any. */
export function findSavedWashRecipeByName(
  recipes: RecipeView[],
  recipeName: string,
): RecipeView | null {
  const needle = recipeName.trim().toLowerCase();
  if (!needle) return null;
  return recipes.find((recipe) => recipe.name.trim().toLowerCase() === needle) ?? null;
}
