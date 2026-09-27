import type { BlendIngredientInput, BlendRecipeSpiritSourceInput } from '../types';
import { ingredientWeightLbs } from './blending';

/** Granulated sugar is purchased in 50 lb bags. Batches should not open a partial bag. */
export const SUGAR_BAG_LBS = 50;

export interface ScaledSpiritRow {
  holding_tank_equipment_id: number;
  barrel_id?: number | null;
  volume_gal: number;
  abv: number;
  /** Recipe ABV at this line (for tank-vs-recipe compensation). */
  recipe_abv: number;
  amount: number;
  unit: string;
}

export function roundScaledAmount(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function scaleSpiritSources(
  sources: BlendRecipeSpiritSourceInput[],
  factor: number,
  tankIds: number[] = [],
): ScaledSpiritRow[] {
  const safeFactor = Math.max(0, factor);
  if (sources.length === 0) {
    return [{
      holding_tank_equipment_id: 0,
      volume_gal: 0,
      abv: 0,
      recipe_abv: 0,
      amount: 0,
      unit: 'gal',
    }];
  }
  return sources.map((source, index) => {
    const volume = roundScaledAmount(source.volume_gal * safeFactor);
    return {
      holding_tank_equipment_id: tankIds[index] ?? 0,
      barrel_id: source.barrel_id ?? null,
      volume_gal: volume,
      abv: source.abv,
      recipe_abv: source.abv,
      amount: volume,
      unit: 'gal',
    };
  });
}

export function scaleIngredients(
  ingredients: BlendIngredientInput[],
  factor: number,
): BlendIngredientInput[] {
  const safeFactor = Math.max(0, factor);
  return ingredients.map((ingredient) => ({
    ...ingredient,
    amount: roundScaledAmount(ingredient.amount * safeFactor),
  }));
}

export function scaleFactorFromTargetYield(baseYieldGal: number, targetYieldGal: number): number {
  if (baseYieldGal <= 0 || targetYieldGal <= 0) return 1;
  return roundScaledAmount(targetYieldGal / baseYieldGal);
}

export function totalSugarLbs(
  ingredients: Pick<BlendIngredientInput, 'ingredient_type' | 'amount' | 'unit'>[],
): number {
  return ingredients.reduce((sum, ingredient) => {
    if (ingredient.ingredient_type !== 'sugar' || !(ingredient.amount > 0)) return sum;
    return sum + ingredientWeightLbs(ingredient);
  }, 0);
}

/** Nearest whole-bag count for a sugar weight. At least one bag when any sugar is used. */
export function nearestSugarBagCount(sugarLbs: number, bagLbs = SUGAR_BAG_LBS): number {
  if (!(sugarLbs > 0) || !(bagLbs > 0)) return 0;
  return Math.max(1, Math.round(sugarLbs / bagLbs));
}

export function sugarLbsAreWholeBags(sugarLbs: number, bagLbs = SUGAR_BAG_LBS): boolean {
  if (!(sugarLbs > 0)) return true;
  const bags = sugarLbs / bagLbs;
  return Math.abs(bags - Math.round(bags)) < 0.001;
}

/**
 * Scale factor that keeps granulated sugar on whole 50 lb bags.
 * Recipes without sugar keep the requested factor.
 */
export function scaleFactorForWholeSugarBags(
  baseSugarLbs: number,
  desiredFactor: number,
  bagLbs = SUGAR_BAG_LBS,
): number {
  const factor = desiredFactor > 0 ? desiredFactor : 1;
  if (!(baseSugarLbs > 0)) return factor;
  const bags = nearestSugarBagCount(baseSugarLbs * factor, bagLbs);
  return (bags * bagLbs) / baseSugarLbs;
}

export function sugarBagScaleIssue(
  sugarLbs: number,
  bagLbs = SUGAR_BAG_LBS,
): string | null {
  if (!(sugarLbs > 0) || sugarLbsAreWholeBags(sugarLbs, bagLbs)) return null;
  const bags = nearestSugarBagCount(sugarLbs, bagLbs);
  return `Sugar has to be whole ${bagLbs} lb bags so you don't open a partial bag. This batch uses ${sugarLbs.toFixed(1)} lb. Use ${bags} bag${bags === 1 ? '' : 's'} (${bags * bagLbs} lb).`;
}
