import { describe, expect, it } from 'vitest';
import { LB_PER_KG, LITERS_PER_US_GALLON } from '../services/spirit-gauging';
import { convertVolume, convertWeight, formatConvertedAmount } from './unit-converter';

describe('volume converter', () => {
  it('converts one US gallon into liters, milliliters, and fluid ounces', () => {
    const result = convertVolume(1, 'gal');
    expect(result).not.toBeNull();
    expect(result!.gal).toBeCloseTo(1, 8);
    expect(result!.l).toBeCloseTo(LITERS_PER_US_GALLON, 8);
    expect(result!.ml).toBeCloseTo(LITERS_PER_US_GALLON * 1000, 4);
    expect(result!.floz).toBeCloseTo(128, 8);
  });

  it('round-trips liters back to gallons', () => {
    const liters = convertVolume(2.5, 'gal')!.l;
    expect(convertVolume(liters, 'l')!.gal).toBeCloseTo(2.5, 8);
  });

  it('rejects amounts that are not a number', () => {
    expect(convertVolume(Number.NaN, 'ml')).toBeNull();
    expect(convertVolume(Number.POSITIVE_INFINITY, 'l')).toBeNull();
  });
});

describe('weight converter', () => {
  it('converts one kilogram into pounds, ounces, and grams', () => {
    const result = convertWeight(1, 'kg');
    expect(result).not.toBeNull();
    expect(result!.kg).toBeCloseTo(1, 8);
    expect(result!.g).toBeCloseTo(1000, 6);
    expect(result!.lb).toBeCloseTo(LB_PER_KG, 8);
    expect(result!.oz).toBeCloseTo(LB_PER_KG * 16, 6);
  });

  it('round-trips pounds back to kilograms', () => {
    const pounds = convertWeight(4, 'kg')!.lb;
    expect(convertWeight(pounds, 'lb')!.kg).toBeCloseTo(4, 8);
  });

  it('rejects amounts that are not a number', () => {
    expect(convertWeight(Number.NaN, 'lb')).toBeNull();
  });
});

describe('formatConvertedAmount', () => {
  it('keeps small amounts readable', () => {
    expect(formatConvertedAmount(0)).toBe('0');
    expect(formatConvertedAmount(0.125)).toBe('0.1250');
    expect(formatConvertedAmount(12.5)).toBe('12.500');
    expect(formatConvertedAmount(128)).toBe('128.00');
  });
});
