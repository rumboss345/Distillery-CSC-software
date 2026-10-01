import { describe, expect, it } from 'vitest';
import { assertEnteredAbv, limitAbvInput, limitAbvNumber, MAX_ENTERED_ABV } from './abv-limits';

describe('entered alcohol content', () => {
  it('caps typed values at 99%', () => {
    expect(MAX_ENTERED_ABV).toBe(99);
    expect(limitAbvInput('')).toBe('');
    expect(limitAbvInput('40.5')).toBe('40.5');
    expect(limitAbvInput('99')).toBe('99');
    expect(limitAbvInput('99.1')).toBe('99');
    expect(limitAbvInput('100')).toBe('99');
    expect(limitAbvInput('150')).toBe('99');
    expect(limitAbvNumber(80)).toBe(80);
    expect(limitAbvNumber(99.4)).toBe(99);
  });

  it('rejects a saved alcohol content over 99%', () => {
    expect(() => assertEnteredAbv(99)).not.toThrow();
    expect(() => assertEnteredAbv(null)).not.toThrow();
    expect(() => assertEnteredAbv(99.01, 'Cut ABV')).toThrow('Cut ABV cannot be over 99%.');
  });
});
