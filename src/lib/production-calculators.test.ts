import { describe, expect, it } from 'vitest';
import {
  computeBottleYield,
  computeDilutionWaterGal,
} from './production-calculators';

describe('computeDilutionWaterGal', () => {
  it('returns water needed to proof down', () => {
    const result = computeDilutionWaterGal(100, 60, 40);
    expect(result).not.toBeNull();
    expect(result!.waterGal).toBeGreaterThan(0);
    expect(result!.finalAbv).toBeCloseTo(40, 1);
    expect(result!.finalVolumeGal).toBeCloseTo(100 + result!.waterGal, 1);
  });

  it('rejects target above current ABV', () => {
    expect(computeDilutionWaterGal(100, 40, 50)).toBeNull();
  });
});

describe('computeBottleYield', () => {
  it('counts whole 750 mL bottles from volume in gallons', () => {
    const result = computeBottleYield(100, 750);
    expect(result).not.toBeNull();
    expect(result!.bottleCount).toBe(504);
    expect(result!.remainderGal).toBeGreaterThanOrEqual(0);
  });

  it('applies loss percent before counting', () => {
    const full = computeBottleYield(100, 750, 0);
    const withLoss = computeBottleYield(100, 750, 10);
    expect(full!.bottleCount).toBeGreaterThan(withLoss!.bottleCount);
  });
});
