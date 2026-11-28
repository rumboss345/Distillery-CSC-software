import { describe, expect, it } from 'vitest';
import {
  stillChargeBookBlendAbv,
  stillChargeSourceAlcoholVarianceGal,
} from './distillation-charge-variance';

describe('stillChargeSourceAlcoholVarianceGal', () => {
  it('records a loss when measured ABV is below the tank book', () => {
    const variance = stillChargeSourceAlcoholVarianceGal({
      tankSources: [{ volumeGal: 100, bookAbv: 63 }],
      spiritVolumeGal: 100,
      measuredSpiritAbv: 61,
    });
    expect(variance).toBeCloseTo(-2, 2);
  });

  it('records a gain when measured ABV is above the tank book', () => {
    const variance = stillChargeSourceAlcoholVarianceGal({
      tankSources: [{ volumeGal: 50, bookAbv: 40 }],
      spiritVolumeGal: 50,
      measuredSpiritAbv: 42,
    });
    expect(variance).toBeCloseTo(1, 2);
  });

  it('blends book ABV across multiple tanks', () => {
    expect(stillChargeBookBlendAbv([
      { volumeGal: 60, bookAbv: 60 },
      { volumeGal: 40, bookAbv: 70 },
    ])).toBeCloseTo(64, 1);
  });
});