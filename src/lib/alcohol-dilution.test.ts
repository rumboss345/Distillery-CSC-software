import { describe, expect, it } from 'vitest';
import { computeAlcoholDilution, waterLitersToWeightLb } from './alcohol-dilution';

describe('computeAlcoholDilution', () => {
  it('matches distilling-spirits.com example (volume before dilution)', () => {
    const result = computeAlcoholDilution({
      actualAbvPercent: 58,
      targetAbvPercent: 43,
      volumeLiters: 3.71,
      volumeBasis: 'before',
    });
    expect(result).not.toBeNull();
    expect(result!.spiritVolumeLiters).toBeCloseTo(3.71, 2);
    expect(result!.finalVolumeLiters).toBeCloseTo(5, 1);
    expect(result!.waterVolumeLiters).toBeCloseTo(1.29, 1);
  });

  it('solves from target volume after dilution', () => {
    const result = computeAlcoholDilution({
      actualAbvPercent: 58,
      targetAbvPercent: 43,
      volumeLiters: 5,
      volumeBasis: 'after',
    });
    expect(result).not.toBeNull();
    expect(result!.spiritVolumeLiters).toBeCloseTo(3.71, 1);
    expect(result!.finalVolumeLiters).toBeCloseTo(5, 2);
    expect(result!.waterVolumeLiters).toBeCloseTo(1.29, 1);
  });

  it('converts water volume to weight at 8.34 lb/gal', () => {
    expect(waterLitersToWeightLb(3.785411784)).toBeCloseTo(8.34, 2);
  });

  it('rejects target ABV not lower than starting ABV', () => {
    expect(computeAlcoholDilution({
      actualAbvPercent: 40,
      targetAbvPercent: 43,
      volumeLiters: 10,
      volumeBasis: 'before',
    })).toBeNull();
  });
});
