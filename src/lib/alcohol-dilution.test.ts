import { describe, expect, it } from 'vitest';
import { computeAlcoholDilution, WATER_LBS_PER_US_GALLON, waterLitersToWeightLb } from './alcohol-dilution';

describe('computeAlcoholDilution', () => {
  it('applies Table 6 contraction (volume before dilution)', () => {
    const result = computeAlcoholDilution({
      actualAbvPercent: 58,
      targetAbvPercent: 43,
      volumeLiters: 3.71,
      volumeBasis: 'before',
    });
    expect(result).not.toBeNull();
    expect(result!.spiritVolumeLiters).toBeCloseTo(3.71, 2);
    expect(result!.finalVolumeLiters).toBeCloseTo(3.71 * 58 / 43, 2);
    expect(result!.waterVolumeLiters).toBeGreaterThan(0);
    expect(result!.spiritVolumeLiters + result!.waterVolumeLiters).toBeGreaterThan(result!.finalVolumeLiters);
  });

  it('solves from target volume after dilution with contraction', () => {
    const result = computeAlcoholDilution({
      actualAbvPercent: 58,
      targetAbvPercent: 43,
      volumeLiters: 5,
      volumeBasis: 'after',
    });
    expect(result).not.toBeNull();
    expect(result!.spiritVolumeLiters).toBeCloseTo(5 * 43 / 58, 2);
    expect(result!.finalVolumeLiters).toBeCloseTo(5, 2);
    expect(result!.spiritVolumeLiters + result!.waterVolumeLiters).toBeGreaterThan(result!.finalVolumeLiters);
  });

  it('converts one wine gallon of water with the TTB §30.41 factor', () => {
    expect(WATER_LBS_PER_US_GALLON).toBeCloseTo(1 / 0.120074, 12);
    expect(waterLitersToWeightLb(3.785411784)).toBe(8.33);
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
