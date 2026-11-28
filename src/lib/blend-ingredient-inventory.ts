import type { BlendIngredientInput, InventoryItem } from '../types';
import { additiveSupportsAbv, blendIngredientTypeForCategory, convertIngredientAmount, inferMeasureMode } from './blending';

/** Overlay current inventory master data onto recipe ingredient rows for a new blend run. */
export function refreshBlendIngredientsFromInventory(
  ingredients: BlendIngredientInput[],
  inventoryById: ReadonlyMap<number, InventoryItem>,
): BlendIngredientInput[] {
  return ingredients.map((ingredient) => {
    const id = ingredient.inventory_item_id;
    if (id == null || !(id > 0)) return ingredient;
    const item = inventoryById.get(id);
    if (!item) return ingredient;

    const ingredientType = blendIngredientTypeForCategory(item.category);
    let amount = ingredient.amount;
    let unit = ingredient.unit;
    if (item.unit && item.unit !== ingredient.unit) {
      const fromMode = inferMeasureMode(ingredient.unit);
      const toMode = inferMeasureMode(item.unit);
      if (fromMode === toMode) {
        amount = convertIngredientAmount(ingredient, item.unit);
        unit = item.unit;
      }
    }

    const densityFromInventory = item.density_g_per_ml != null && item.density_g_per_ml > 0
    ? item.density_g_per_ml
    : null;

    return {
      ...ingredient,
      name: item.name,
      unit,
      amount,
      inventory_category: item.category,
      ingredient_type: ingredientType,
      abv: additiveSupportsAbv(ingredientType) ? (item.abv ?? null) : ingredient.abv ?? null,
      density_g_per_ml: densityFromInventory,
      density_assumption: densityFromInventory != null ? null : ingredient.density_assumption ?? null,
      sugar_mass_fraction: item.sugar_mass_fraction ?? null,
      solids_mass_fraction: item.solids_mass_fraction ?? null,
      density_temp_c: item.density_temp_c ?? null,
      spec_status: item.spec_status ?? null,
      spec_source: item.density_reference?.trim() ? item.density_reference.trim() : null,
      cost_per_unit: item.cost_per_unit ?? ingredient.cost_per_unit ?? null,
    };
  });
}