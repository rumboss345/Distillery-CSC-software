import { computeTheoreticalBlend, solveWaterForTargetAbv, type AdditiveInput, type SpiritSourceInput } from './blend-formulation';
import type { BlendIngredientInput, BlendRecipeSpiritSourceInput } from '../types';

export const ABV_CONFIRM_TOLERANCE = 0.3;

export function abvMatchesTarget(
  calculatedAbv: number,
  targetAbv: number,
  tolerance = ABV_CONFIRM_TOLERANCE,
): boolean {
  return Math.abs(calculatedAbv - targetAbv) <= tolerance;
}

export function toRecipeSpiritInputs(
  sources: BlendRecipeSpiritSourceInput[],
): SpiritSourceInput[] {
  return sources
    .filter((source) => source.volume_gal > 0 && source.abv > 0)
    .map((source) => ({
      volumeGal: source.volume_gal,
      abv: source.abv,
      label: source.spirit_label,
    }));
}

export function toRecipeAdditiveInputs(
  ingredients: BlendIngredientInput[],
): AdditiveInput[] {
  return ingredients
    .filter((ingredient) => ingredient.amount > 0)
    .map((ingredient) => ({
      ingredientType: ingredient.ingredient_type,
      name: ingredient.name,
      amount: ingredient.amount,
      unit: ingredient.unit,
      abv: ingredient.abv,
    }));
}

export function computeRecipeTheoreticalAbv(
  spirits: BlendRecipeSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
): { abv: number | null; volumeGal: number | null } {
  const spiritInputs = toRecipeSpiritInputs(spirits);
  if (spiritInputs.length === 0) return { abv: null, volumeGal: null };

  const result = computeTheoreticalBlend(spiritInputs, toRecipeAdditiveInputs(ingredients));
  if (result.volumeGal <= 0 || result.abv <= 0) {
    return { abv: null, volumeGal: null };
  }
  return { abv: result.abv, volumeGal: result.volumeGal };
}

/** Replace recipe water with the gallons needed to hit the target proof. */
export function ingredientsWithProofingWater(
  ingredients: BlendIngredientInput[],
  waterGal: number,
): BlendIngredientInput[] {
  const existing = ingredients.find((row) => row.ingredient_type === 'water');
  const water: BlendIngredientInput = {
    ingredient_type: 'water',
    name: existing?.name.trim() || 'Proofing water',
    amount: Math.round(waterGal * 1000) / 1000,
    unit: 'gal',
    abv: null,
    cost_per_unit: existing?.cost_per_unit ?? null,
    lot_number: existing?.lot_number ?? '',
    inventory_item_id: null,
    notes: existing?.notes ?? '',
  };
  return [water, ...ingredients.filter((row) => row.ingredient_type !== 'water')];
}

/**
 * Gallons of proofing water that bring the recipe to the target ABV.
 * Water only lowers proof, so a target above the undiluted blend cannot be solved.
 */
export function proofingWaterForRecipe(
  spirits: BlendRecipeSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  targetAbv: number,
): { waterGal: number; abv: number } | null {
  const solved = solveWaterForTargetAbv(
    toRecipeSpiritInputs(spirits),
    toRecipeAdditiveInputs(ingredients.filter((row) => row.ingredient_type !== 'water')),
    targetAbv,
  );
  if (!solved) return null;
  if (solved.waterGal <= 0.001 && solved.result.abv + ABV_CONFIRM_TOLERANCE < targetAbv) {
    return null;
  }
  return { waterGal: solved.waterGal, abv: solved.result.abv };
}
