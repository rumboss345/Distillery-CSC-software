import type { MashBatchNutrientInput, RecipeNutrient, RecipeNutrientInput } from '../types';

export const NUTRIENT_UNITS = [
  { value: 'lbs', label: 'lbs', kind: 'weight' },
  { value: 'oz', label: 'oz', kind: 'weight' },
  { value: 'g', label: 'grams', kind: 'weight' },
  { value: 'kg', label: 'kg', kind: 'weight' },
  { value: 'ml', label: 'ml', kind: 'volume' },
  { value: 'l', label: 'L', kind: 'volume' },
] as const;

export type NutrientUnit = typeof NUTRIENT_UNITS[number]['value'];

/** Grams per 1 of each unit. Volume uses water density so 1 ml = 1 g. */
const GRAMS_PER_UNIT: Record<NutrientUnit, number> = {
  g: 1,
  kg: 1000,
  lbs: 453.59237,
  oz: 28.349523125,
  ml: 1,
  l: 1000,
};

const UNIT_ALIASES: Record<string, NutrientUnit> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  lb: 'lbs',
  lbs: 'lbs',
  pound: 'lbs',
  pounds: 'lbs',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
};

export function normalizeNutrientUnit(unit: string | null | undefined): NutrientUnit {
  const raw = (unit ?? '').trim().toLowerCase();
  return UNIT_ALIASES[raw] ?? 'lbs';
}

export function nutrientUnitLabel(unit: string | null | undefined): string {
  const normalized = normalizeNutrientUnit(unit);
  return NUTRIENT_UNITS.find((option) => option.value === normalized)?.label ?? normalized;
}

/**
 * Convert a nutrient amount into another unit.
 * Weight converts exactly. Volume converts exactly. Mixing weight and volume
 * uses water density (1 ml = 1 g) so a liquid measured in ml can deduct a
 * stock item kept in lbs.
 */
export function nutrientAmountInUnit(amount: number, fromUnit: string, toUnit: string): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const from = normalizeNutrientUnit(fromUnit);
  const to = normalizeNutrientUnit(toUnit);
  if (from === to) return amount;
  const grams = amount * GRAMS_PER_UNIT[from];
  return grams / GRAMS_PER_UNIT[to];
}

export function emptyRecipeNutrient(): RecipeNutrientInput {
  return {
    name: '',
    amount: 0,
    unit: 'lbs',
    inventory_item_id: null,
    notes: '',
  };
}

export function emptyMashBatchNutrient(): MashBatchNutrientInput {
  return { name: '', amount: 0, unit: 'lbs' };
}

export function recipeNutrientsToBatchInputs(
  nutrients: RecipeNutrient[],
): MashBatchNutrientInput[] {
  return nutrients
    .filter((n) => n.name.trim() && n.amount > 0)
    .map((n) => ({
      name: n.name.trim(),
      amount: n.amount,
      unit: normalizeNutrientUnit(n.unit),
    }));
}

function formatNutrientAmount(amount: number): string {
  return amount >= 10 ? amount.toFixed(1) : amount.toFixed(2);
}

export function formatRecipeNutrientLine(
  n: Pick<RecipeNutrient, 'amount' | 'name'> & { unit?: string | null },
): string {
  const amount = formatNutrientAmount(n.amount);
  const name = n.name.trim() || 'Nutrient';
  return `${name} (${amount} ${nutrientUnitLabel(n.unit)})`;
}

export function formatRecipeNutrientsSummary(nutrients: RecipeNutrient[]): string {
  return nutrients
    .filter((n) => n.amount > 0 && n.name.trim())
    .map(formatRecipeNutrientLine)
    .join(', ');
}

export function formatMashBatchNutrientsSummary(nutrients: MashBatchNutrientInput[]): string {
  return nutrients
    .filter((n) => n.amount > 0 && n.name.trim())
    .map((n) => formatRecipeNutrientLine({ name: n.name, amount: n.amount, unit: n.unit }))
    .join(', ');
}
