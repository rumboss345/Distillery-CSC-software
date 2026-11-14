import { describe, expect, it } from 'vitest';
import { inputValueUpToDecimals, limitDecimalPlaces } from './decimal-places';

describe('two-decimal inputs', () => {
  it('cuts typed digits past two decimals', () => {
    expect(limitDecimalPlaces('12.345')).toBe('12.34');
    expect(limitDecimalPlaces('12.3')).toBe('12.3');
    expect(limitDecimalPlaces('12.')).toBe('12.');
    expect(limitDecimalPlaces('.129')).toBe('.12');
    expect(limitDecimalPlaces('')).toBe('');
    expect(limitDecimalPlaces('40')).toBe('40');
  });

  it('rounds filled-in values to two decimals', () => {
    expect(inputValueUpToDecimals(63.456789)).toBe('63.46');
    expect(inputValueUpToDecimals(40)).toBe('40');
    expect(inputValueUpToDecimals(12.5)).toBe('12.5');
    expect(inputValueUpToDecimals(0)).toBe('');
    expect(inputValueUpToDecimals(null)).toBe('');
  });
});
