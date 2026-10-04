import { ingredientVolumeGal } from './blending';
import { analyzeFormulation, type FormulationComponent } from './formulation-engine';
import type { BlendIngredientInput, BlendIngredientType, BlendRecipeSpiritSourceInput } from '../types';

export const ABV_CONFIRM_TOLERANCE = 0.3;

export function abvMatchesTarget(
  calculatedAbv: number,
  targetAbv: number,
  tolerance = ABV_CONFIRM_TOLERANCE,
): boolean {
  return Math.abs(calculatedAbv - targetAbv) <= tolerance;
}

/** How the calculated proof sits against the target the blend was designed to. */
export function proofGapDescription(calculatedAbv: number, targetAbv: number): string {
  const delta = calculatedAbv - targetAbv;
  if (Math.abs(delta) <= ABV_CONFIRM_TOLERANCE) {
    return `matches within ${ABV_CONFIRM_TOLERANCE}%`;
  }
  const direction = delta > 0 ? 'above' : 'below';
  return `calculated is ${Math.abs(delta).toFixed(1)}% ${direction} the target`;
}

function recipeComponents(
  spirits: BlendRecipeSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  waterGalOverride?: number,
): FormulationComponent[] {
  const components: FormulationComponent[] = [];
  for (const spirit of spirits) {
    if (!(spirit.volume_gal > 0) || !(spirit.abv > 0)) continue;
    components.push({
      kind: 'spirit',
      name: spirit.spirit_label.trim() || 'Spirit',
      amount: spirit.volume_gal,
      unit: 'gal',
      abv: spirit.abv,
      temperatureF: 60,
    });
  }
  for (const ingredient of ingredients) {
    if (ingredient.ingredient_type === 'water') continue;
    if (!(ingredient.amount > 0)) continue;
    components.push({
      kind: ingredient.ingredient_type as BlendIngredientType,
      name: ingredient.name.trim() || ingredient.ingredient_type,
      amount: ingredient.amount,
      unit: ingredient.unit,
      abv: ingredient.abv,
    });
  }
  const waterGal = waterGalOverride ?? ingredients
    .filter((ingredient) => ingredient.ingredient_type === 'water' && ingredient.amount > 0)
    .reduce((sum, ingredient) => sum + ingredientVolumeGal(ingredient), 0);
  if (waterGal > 0) {
    components.push({ kind: 'water', name: 'Proofing water', amount: waterGal, unit: 'gal' });
  }
  return components;
}

function analyzeRecipe(
  spirits: BlendRecipeSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  waterGalOverride?: number,
): { abv: number; volumeGal: number } | null {
  const components = recipeComponents(spirits, ingredients, waterGalOverride);
  if (components.length === 0) return null;
  const result = analyzeFormulation(components);
  if (!result.ok || result.volumeGal <= 0 || result.abv <= 0) return null;
  return { abv: result.abv, volumeGal: result.volumeGal };
}

export function computeRecipeTheoreticalAbv(
  spirits: BlendRecipeSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
): { abv: number | null; volumeGal: number | null } {
  const result = analyzeRecipe(spirits, ingredients);
  if (!result) return { abv: null, volumeGal: null };
  return result;
}

/**
 * Gallons of proofing water that bring these spirits and additives to the target ABV.
 * Existing water is replaced. Returns an error when water alone cannot reach the target.
 */
export function proofingWaterGalForTarget(
  spirits: BlendRecipeSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  targetAbv: number,
): { waterGal: number } | { error: string } {
  if (!(targetAbv > 0)) return { error: 'Enter a target proof first.' };
  const withoutWater = analyzeRecipe(spirits, ingredients, 0);
  if (!withoutWater) return { error: 'Enter a spirit pull before adjusting proofing water.' };
  if (withoutWater.abv <= targetAbv + ABV_CONFIRM_TOLERANCE) {
    if (abvMatchesTarget(withoutWater.abv, targetAbv)) return { waterGal: 0 };
    return {
      error: `Without proofing water this blend is ${withoutWater.abv.toFixed(1)}% ABV, already below the ${targetAbv.toFixed(1)}% target. Water cannot raise the proof.`,
    };
  }

  let low = 0;
  let high = Math.max(withoutWater.volumeGal, 0.1);
  let highResult = analyzeRecipe(spirits, ingredients, high);
  while (highResult && highResult.abv > targetAbv && high < 100000) {
    high *= 2;
    highResult = analyzeRecipe(spirits, ingredients, high);
  }
  if (!highResult) return { error: 'Could not calculate proofing water for this target.' };

  for (let step = 0; step < 50; step += 1) {
    const mid = (low + high) / 2;
    const result = analyzeRecipe(spirits, ingredients, mid);
    if (!result) return { error: 'Could not calculate proofing water for this target.' };
    if (result.abv > targetAbv) low = mid;
    else high = mid;
  }

  const waterGal = Math.round(high * 1000) / 1000;
  const checked = analyzeRecipe(spirits, ingredients, waterGal);
  if (!checked || !abvMatchesTarget(checked.abv, targetAbv, 0.15)) {
    return { error: 'Proofing water could not bring this blend to the target proof.' };
  }
  return { waterGal };
}
