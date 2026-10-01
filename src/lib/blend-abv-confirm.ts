import { MAX_ENTERED_ABV } from './abv-limits';
import { computeTheoreticalBlend, type AdditiveInput, type SpiritSourceInput } from './blend-formulation';
import type { BlendIngredientInput, BlendRecipeSpiritSourceInput } from '../types';

/** US proof is twice the alcohol percent. 80 proof is 40% ABV. */
export function abvFromUsProof(proof: number): number | null {
  if (!Number.isFinite(proof) || proof <= 0) return null;
  const abv = proof / 2;
  if (abv > MAX_ENTERED_ABV) return null;
  return Math.round(abv * 10) / 10;
}

export function usProofFromAbv(abv: number): number | null {
  if (!Number.isFinite(abv) || abv <= 0 || abv > MAX_ENTERED_ABV) return null;
  return Math.round(abv * 2 * 10) / 10;
}

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
