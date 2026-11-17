/** Gin recipe id + name sent from the Distillation form before server-side validation. */
export function ginRecipeFieldsForDistillationSave(
  runType: string,
  ginRecipeId: number | '',
  ginRecipeName: string,
  recipes: readonly { id: number; name: string }[],
): { gin_recipe_id: number | null; gin_recipe_name: string } {
  if (runType !== 'gin') {
    return { gin_recipe_id: null, gin_recipe_name: '' };
  }
  const id = typeof ginRecipeId === 'number' && ginRecipeId > 0 ? ginRecipeId : null;
  const name = ginRecipeName.trim()
    || (id != null ? recipes.find((recipe) => recipe.id === id)?.name.trim() : '')
    || '';
  return { gin_recipe_id: id, gin_recipe_name: name };
}