import { assertAbvPercent } from '../conventions.js';

export function validateRequired(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

export function validatePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be greater than zero.`);
  }
}

export function validateNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be zero or greater.`);
  }
}

export function validateAbvOptional(abv: number | null | undefined, field = 'ABV'): void {
  if (abv == null || Number.isNaN(abv)) return;
  assertAbvPercent(abv, field);
}

export function validateAbvRequired(abv: number, field = 'ABV'): void {
  assertAbvPercent(abv, field);
  if (abv <= 0) throw new Error(`${field} must be greater than zero.`);
}

export function validateConversionFactor(factor: number): void {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error('Conversion factor must be greater than zero.');
  }
}
