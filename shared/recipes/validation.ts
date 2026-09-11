import { assertAbvPercent } from '../conventions.js';
import { validatePositive, validateRequired } from '../master-data/validation.js';
import { IMPLEMENTED_QUANTITY_BASIS, INGREDIENT_TYPES, VERSION_STATUSES } from './constants.js';

export function validateRecipeName(name: string): void {
  validateRequired(name, 'Recipe name');
}

export function validateBatchSizeUnit(unit: string): void {
  validateRequired(unit, 'Batch size unit');
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

export function validateExpectedYieldOptional(yieldPercent: number | null | undefined): void {
  if (yieldPercent == null || Number.isNaN(yieldPercent)) return;
  if (!Number.isFinite(yieldPercent) || yieldPercent <= 0 || yieldPercent > 100) {
    throw new Error('Expected yield must be greater than zero and at most 100%.');
  }
}

export function validateTargetBrixOptional(brix: number | null | undefined): void {
  if (brix == null || Number.isNaN(brix)) return;
  if (!Number.isFinite(brix) || brix < 0) {
    throw new Error('Target Brix must be zero or greater.');
  }
}

export function validateTargetPhOptional(ph: number | null | undefined): void {
  if (ph == null || Number.isNaN(ph)) return;
  if (!Number.isFinite(ph) || ph < 0 || ph > 14) {
    throw new Error('Target pH must be between 0 and 14.');
  }
}

export function validateCarbonationOptional(volumes: number | null | undefined): void {
  if (volumes == null || Number.isNaN(volumes)) return;
  validatePositive(volumes, 'Target carbonation volumes');
}

export function validateIngredientQuantity(quantity: number): void {
  validatePositive(quantity, 'Quantity');
}

export function validateIngredientUnit(unit: string): void {
  validateRequired(unit, 'Unit');
}

export function validateStepNumber(stepNumber: number): void {
  if (!Number.isInteger(stepNumber) || stepNumber < 1) {
    throw new Error('Step number must be a positive integer.');
  }
}

export function validateStepInstruction(instruction: string): void {
  validateRequired(instruction, 'Instruction');
}
