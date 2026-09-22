import type { MashBatchNutrientInput, RecipeNutrient, RecipeNutrientInput } from '../types';

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
  return { name: '', lbs: 0 };
}

export function recipeNutrientsToBatchInputs(
  nutrients: RecipeNutrient[],
): MashBatchNutrientInput[] {
  return nutrients
    .filter((n) => n.name.trim() && n.amount > 0)
    .map((n) => ({ name: n.name.trim(), lbs: n.amount }));
}

export function formatRecipeNutrientLine(n: Pick<RecipeNutrient, 'amount' | 'name'>): string {
  const lbs = n.amount >= 10 ? n.amount.toFixed(1) : n.amount.toFixed(2);
  const name = n.name.trim() || 'Nutrient';
  return `${name} (${lbs} lbs)`;
}

export function formatRecipeNutrientsSummary(nutrients: RecipeNutrient[]): string {
  return nutrients
    .filter((n) => n.amount > 0 && n.name.trim())
    .map(formatRecipeNutrientLine)
    .join(', ');
}

export function formatMashBatchNutrientsSummary(nutrients: MashBatchNutrientInput[]): string {
  return nutrients
    .filter((n) => n.lbs > 0 && n.name.trim())
    .map((n) => formatRecipeNutrientLine({ name: n.name, amount: n.lbs }))
    .join(', ');
}
