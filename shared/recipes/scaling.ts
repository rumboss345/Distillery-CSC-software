import { validatePositive } from '../master-data/validation.js';

/** Proportional scale factor from base batch size to target batch size. */
export function recipeScaleFactor(baseBatchSize: number, targetBatchSize: number): number {
  validatePositive(baseBatchSize, 'Base batch size');
  validatePositive(targetBatchSize, 'Target batch size');
  return targetBatchSize / baseBatchSize;
}

/** Scale a fixed/per-batch ingredient quantity proportionally. */
export function scaleIngredientQuantity(
  quantity: number,
  baseBatchSize: number,
  targetBatchSize: number,
): number {
  const factor = recipeScaleFactor(baseBatchSize, targetBatchSize);
  return quantity * factor;
}

export interface ScaledIngredientLine {
  id: number;
  ingredient_type: string;
  description: string;
  baseQuantity: number;
  scaledQuantity: number;
  unit: string;
  quantity_basis: string;
}

/** Scale ingredient lines for calculator display (does not persist). */
export function scaleRecipeIngredients<T extends {
  id: number;
  ingredient_type: string;
  description: string | null;
  material_name?: string | null;
  quantity: number;
  unit: string;
  quantity_basis: string;
}>(
  ingredients: T[],
  baseBatchSize: number,
  targetBatchSize: number,
): ScaledIngredientLine[] {
  const factor = recipeScaleFactor(baseBatchSize, targetBatchSize);
  return ingredients.map((line) => {
    const basis = line.quantity_basis;
    const scales = basis === 'Fixed Quantity' || basis === 'Per Batch';
    return {
      id: line.id,
      ingredient_type: line.ingredient_type,
      description: line.material_name ?? line.description ?? line.ingredient_type,
      baseQuantity: line.quantity,
      scaledQuantity: scales ? line.quantity * factor : line.quantity,
      unit: line.unit,
      quantity_basis: line.quantity_basis,
    };
  });
}
