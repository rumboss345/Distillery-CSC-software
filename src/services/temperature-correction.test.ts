import { describe, expect, it } from 'vitest';
import {
  blendVolumeWeightedAbv,
  correctAbvTo60F,
  correctProofTo60F,
  applyAbvTemperatureCorrection,
} from './temperature-correction';

describe('temperature-correction', () => {
  it('returns observed proof unchanged at 60 °F', () => {
    expect(correctProofTo60F(120, 60)).toBe(120);
  });

  it('matches TTB interpolation example (80.32 proof @ 68.36 °F → 76.6 proof)', () => {
    expect(correctProofTo60F(80.32, 68.36)).toBeCloseTo(76.6, 1);
  });

  it('matches TTB interpolation example (192.82 proof @ 72.15 °F → ~190 proof)', () => {
    expect(correctProofTo60F(192.82, 72.15)).toBeGreaterThanOrEqual(189.9);
    expect(correctProofTo60F(192.82, 72.15)).toBeLessThanOrEqual(190.0);
  });

  it('matches CFR Table 1 example (193 proof @ 75 °F → ~189.5 proof)', () => {
    expect(correctProofTo60F(193, 75)).toBeGreaterThanOrEqual(189.4);
    expect(correctProofTo60F(193, 75)).toBeLessThanOrEqual(189.5);
  });

  it('corrects ABV to 60 °F basis', () => {
    expect(correctAbvTo60F(40.16, 68.36)).toBeCloseTo(38.3, 1);
  });

  it('reports when correction was applied', () => {
    const result = applyAbvTemperatureCorrection(41.2, 72);
    expect(result).not.toBeNull();
    expect(result!.applied).toBe(true);
    expect(result!.correctedAbv).toBeLessThan(result!.observedAbv);
  });

  it('blends volume-weighted ABV on 60 °F basis', () => {
    expect(blendVolumeWeightedAbv(100, 40, 50, 80)).toBeCloseTo(53.33, 1);
  });
});
