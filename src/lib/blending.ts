import type { BlendIngredientInput, BlendIngredientType } from '../types';
import { ML_PER_GALLON } from '../types';

export const BLEND_INGREDIENT_TYPES: { value: BlendIngredientType; label: string }[] = [
  { value: 'water', label: 'Water (dilution)' },
  { value: 'sugar', label: 'Sugar' },
  { value: 'flavoring', label: 'Flavoring' },
  { value: 'other', label: 'Other' },
];

export const INGREDIENT_UNITS: Record<BlendIngredientType, string[]> = {
  water: ['gal', 'fl oz', 'ml'],
  sugar: ['lbs', 'oz', 'ml'],
  flavoring: ['gal', 'fl oz', 'oz', 'ml'],
  other: ['gal', 'lbs', 'oz', 'fl oz', 'ml', 'each'],
};

export function ingredientVolumeGal(ingredient: Pick<BlendIngredientInput, 'amount' | 'unit'>): number {
  const { amount, unit } = ingredient;
  if (amount <= 0) return 0;
  switch (unit.toLowerCase()) {
    case 'gal':
      return amount;
    case 'ml':
      return amount / ML_PER_GALLON;
    case 'l':
      return amount * 0.264172;
    case 'fl oz':
    case 'floz':
      return amount / 128;
    default:
      return 0;
  }
}

export function computeBlendTotals(
  baseSpiritVolumeGal: number,
  baseSpiritAbv: number,
  ingredients: BlendIngredientInput[],
): { finalVolumeGal: number; finalAbv: number } {
  const extraVolumeGal = ingredients.reduce(
    (sum, ing) => sum + ingredientVolumeGal(ing),
    0,
  );
  const finalVolumeGal = baseSpiritVolumeGal + extraVolumeGal;
  const baseGpa = baseSpiritVolumeGal * baseSpiritAbv / 100;
  const finalAbv = finalVolumeGal > 0 ? (baseGpa / finalVolumeGal) * 100 : 0;
  return {
    finalVolumeGal: Math.round(finalVolumeGal * 1000) / 1000,
    finalAbv: Math.round(finalAbv * 100) / 100,
  };
}

export function defaultIngredientUnit(type: BlendIngredientType): string {
  return INGREDIENT_UNITS[type][0];
}
