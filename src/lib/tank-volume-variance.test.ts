import { describe, expect, it } from 'vitest';
import {
  formatTankVolumeVariance,
  tankVolumeMatchesRecord,
  tankVolumeVarianceGal,
} from './tank-volume-variance';

describe('tank volume variance', () => {
  it('records a short tank as a negative variance', () => {
    expect(tankVolumeVarianceGal(120, 115)).toBe(-5);
    expect(formatTankVolumeVariance(-5)).toBe('-5.00 gal');
  });

  it('records extra gallons as a positive variance', () => {
    expect(tankVolumeVarianceGal(10, 10.5)).toBe(0.5);
    expect(formatTankVolumeVariance(0.5)).toBe('+0.50 gal');
  });

  it('treats a gauge within half a hundredth as a match', () => {
    expect(tankVolumeVarianceGal(80.004, 80.002)).toBe(-0.002);
    expect(tankVolumeMatchesRecord(-0.002)).toBe(true);
    expect(formatTankVolumeVariance(-0.002)).toBe('0.00 gal');
    expect(tankVolumeVarianceGal(40, 40)).toBe(0);
  });

  it('keeps a thousandth of a gallon', () => {
    expect(tankVolumeVarianceGal(1.2344, 2)).toBe(0.766);
  });
});
