import { assertAbvPercent } from '../conventions.js';
import { validatePositive, validateRequired } from '../master-data/validation.js';
import { IMPLEMENTED_QUANTITY_BASIS, INGREDIENT_TYPES, VERSION_STATUSES } from './constants.js';

export function validateRecipeName(name: string): void {
  validateRequired(name, 'Recipe name');
}

export function validateVersionStatus(status: string): void {
  if (!(VERSION_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid version status "${status}".`);
  }
}

export function validateIngredientType(type: string): void {
  if (!(INGREDIENT_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Invalid ingredient type "${type}".`);
  }
}

export function validateQuantityBasis(basis: string): void {
  if (!(IMPLEMENTED_QUANTITY_BASIS as readonly string[]).includes(basis)) {
    throw new Error(`Quantity basis "${basis}" is not supported in Phase 1C. Use Fixed Quantity or Per Batch.`);
  }
}

export function validateTargetBatchSize(size: number): void {
  validatePositive(size, 'Target batch size');
}

export function validateTargetAbvOptional(abv: number | null | undefined): void {
  if (abv == null || Number.isNaN(abv)) return;
  assertAbvPercent(abv, 'Target ABV');
}

export function validateIngredientQuantity(quantity: number): void {
  validatePositive(quantity, 'Quantity');
}
