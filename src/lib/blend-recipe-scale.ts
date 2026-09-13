import type { BlendIngredientInput, BlendRecipeSpiritSourceInput } from '../types';

export interface ScaledSpiritRow {
  holding_tank_equipment_id: number;
  volume_gal: number;
  abv: number;
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
      amount: 0,
      unit: 'gal',
    }];
  }
  return sources.map((source, index) => {
    const volume = roundScaledAmount(source.volume_gal * safeFactor);
    return {
      holding_tank_equipment_id: tankIds[index] ?? 0,
      volume_gal: volume,
      abv: source.abv,
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
