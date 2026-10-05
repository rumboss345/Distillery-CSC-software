import Decimal from 'decimal.js';

/**
 * Boundary for callers that still hold a JavaScript number (a form parser,
 * a gallon already stored as a float). The proofing engine itself accepts
 * only decimal strings. This is not the calculation.
 */
export function decimalStringFromNumber(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('A caller passed a non-finite number into the decimal boundary.');
  }
  return new Decimal(value).toSignificantDigits(15, Decimal.ROUND_HALF_UP).toFixed();
}
