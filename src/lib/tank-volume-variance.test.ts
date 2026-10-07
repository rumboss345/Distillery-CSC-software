import { describe, expect, it } from 'vitest';
import {
  formatTankVolumeVariance,
  tankReadingChanged,
  tankVolumeMatchesRecord,
  tankVolumeVarianceGal,
  volumeChangeReasonError,
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

  it('requires a reason when a volume or ABV reading is changed', () => {
    expect(volumeChangeReasonError('  ')).toBe('Say why this was changed.');
    expect(volumeChangeReasonError('Gauge was short')).toBeNull();
  });

  it('treats an ABV change as a tracked reading even when the gallons match', () => {
    expect(tankReadingChanged(100, 100, 40, 40)).toBe(false);
    expect(tankReadingChanged(100, 100.2, 40, 40)).toBe(true);
    expect(tankReadingChanged(100, 100, 40, 41)).toBe(true);
  });
});
