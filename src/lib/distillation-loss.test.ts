import { describe, expect, it } from 'vitest';
import {
  distillationAlcoholBalance,
  formatDistillationLossSummary,
  washChargeAbvFromBrix,
} from './distillation-loss';

describe('distillationAlcoholBalance', () => {
  it('records loss as alcohol charged minus alcohol collected', () => {
    const balance = distillationAlcoholBalance({
      chargeVolumeGal: 100,
      chargeAbv: 10,
      cuts: [
        { volume_gal: 4, abv: 50 },
        { volume_gal: 2, abv: 40 },
      ],
    });
    expect(balance.chargedGal).toBeCloseTo(10, 4);
    expect(balance.collectedGal).toBeCloseTo(2.8, 4);
    expect(balance.lossGal).toBeCloseTo(7.2, 4);
    expect(balance.basis).toBe('charge');
  });

  it('uses the spirit pulled when the charge was proofed with water', () => {
    const balance = distillationAlcoholBalance({
      chargeVolumeGal: 30,
      chargeAbv: 40,
      proofSpiritGal: 17.6,
      proofSpiritAbv: 68,
      proofWaterGal: 12.7,
      cuts: [{ volume_gal: 10, abv: 70 }],
    });
    expect(balance.chargedGal).toBeCloseTo(17.6 * 0.68, 4);
    expect(balance.collectedGal).toBeCloseTo(7, 4);
    expect(balance.lossGal).toBeCloseTo(17.6 * 0.68 - 7, 4);
    expect(balance.basis).toBe('proofed_spirit');
  });

  it('records a negative loss when collections hold more alcohol than the charge', () => {
    const balance = distillationAlcoholBalance({
      chargeVolumeGal: 10,
      chargeAbv: 40,
      cuts: [{ volume_gal: 8, abv: 60 }],
    });
    expect(balance.chargedGal).toBeCloseTo(4, 4);
    expect(balance.collectedGal).toBeCloseTo(4.8, 4);
    expect(balance.lossGal).toBeCloseTo(-0.8, 4);
  });

  it('leaves loss blank when the charge alcohol is unknown', () => {
    const balance = distillationAlcoholBalance({
      chargeVolumeGal: 100,
      chargeAbv: null,
      cuts: [{ volume_gal: 5, abv: 40 }],
    });
    expect(balance.chargedGal).toBeNull();
    expect(balance.lossGal).toBeNull();
    expect(balance.collectedGal).toBeCloseTo(2, 4);
    expect(balance.basis).toBe('unknown');
    expect(formatDistillationLossSummary(balance)).toContain('not recorded');
  });

  it('marks a Brix estimate and describes the loss', () => {
    const balance = distillationAlcoholBalance({
      chargeVolumeGal: 80,
      chargeAbv: 8,
      estimatedFromBrix: true,
      cuts: [{ volume_gal: 6, abv: 50 }],
    });
    expect(balance.basis).toBe('estimated_brix');
    expect(balance.lossGal).toBeCloseTo(3.4, 4);
    expect(formatDistillationLossSummary(balance)).toContain('Loss 3.40 gal alcohol');
    expect(formatDistillationLossSummary(balance)).toContain('estimated from Brix');
  });
});

describe('washChargeAbvFromBrix', () => {
  it('needs both a start Brix and a current Brix', () => {
    expect(washChargeAbvFromBrix(null, 2)).toBeNull();
    expect(washChargeAbvFromBrix(20, null)).toBeNull();
    expect(washChargeAbvFromBrix(20, 2)).toEqual(expect.any(Number));
  });
});
