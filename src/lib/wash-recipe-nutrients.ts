import type { RecipeNutrient, RecipeNutrientInput } from '../types';

export const WASH_NUTRIENT_UNITS = ['lbs', 'oz', 'g', 'kg'] as const;

export function emptyRecipeNutrient(): RecipeNutrientInput {
  return {
    name: '',
    amount: 0,
    unit: 'lbs',
    inventory_item_id: null,
    notes: '',
  };
}

export function formatRecipeNutrientLine(n: Pick<RecipeNutrient, 'amount' | 'unit' | 'name'>): string {
  const amount = n.amount >= 10 ? n.amount.toFixed(1) : n.amount.toFixed(2);
  const name = n.name.trim() || 'Nutrient';
  return `${amount} ${n.unit} ${name}`;
}

export function formatRecipeNutrientsSummary(nutrients: RecipeNutrient[]): string {
  const lines = nutrients
    .filter((n) => n.amount > 0 || n.name.trim())
    .map(formatRecipeNutrientLine);
  return lines.join('; ');
}

export function appendNutrientsToBatchNotes(
  baseNotes: string,
  nutrients: RecipeNutrient[],
): string {
  const summary = formatRecipeNutrientsSummary(nutrients);
  if (!summary) return baseNotes;
  const block = `Nutrients (from recipe): ${summary}`;
  if (!baseNotes.trim()) return block;
  if (baseNotes.includes('Nutrients (from recipe):')) return baseNotes;
  return `${baseNotes.trim()}\n${block}`;
}
