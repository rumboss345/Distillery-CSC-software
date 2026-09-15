import type { BlendIngredientInput, BlendRecipeSpiritSourceInput } from '../types';

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
