import { describe, expect, it } from 'vitest';
import {
  abvFromProof,
  decomposeWeightLb,
  gaugeFromLiters,
  gaugeFromWeightKg,
  gaugeFromWeightLb,
  gaugeFromWeighingWorkflow,
  gaugeFromWineGallons,
  proofFromAbv,
  proofGallonsFromWeight,
  table3ColumnProofGallons,
  weightFromWineGallons,
  wineGallonsFromProofGallons,
} from './spirit-gauging';

describe('spirit-gauging proof/ABV conversion', () => {
  it('converts proof and ABV both ways', () => {
    expect(proofFromAbv(60)).toBe(120);
    expect(abvFromProof(120)).toBe(60);
    expect(proofFromAbv(96)).toBe(192);
    expect(abvFromProof(150)).toBe(75);
  });
});

describe('TTB Table 3 CFR §30.63 examples', () => {
  it('matches 321.5 lb at 86 proof = 35.1 proof gallons', () => {
    expect(proofGallonsFromWeight(321.5, 86)).toBe(35.1);
    expect(wineGallonsFromProofGallons(35.1, 86)).toBeCloseTo(40.8, 1);
  });

  it('matches 60,378 lb at 190 proof = 16,884.1 proof gallons', () => {
    expect(proofGallonsFromWeight(60378, 190)).toBe(16884.1);
  });
});

describe('Table 3 column intersections', () => {
  it('matches published values at 80 proof', () => {
    expect(table3ColumnProofGallons(80, 100)).toBe(10.1);
    expect(table3ColumnProofGallons(80, 1000)).toBe(100.9);
  });

  it('matches published values at 100 proof', () => {
    expect(table3ColumnProofGallons(100, 100)).toBe(12.9);
    expect(table3ColumnProofGallons(100, 500)).toBe(64.3);
  });

  it('matches published values at 120 proof', () => {
    expect(table3ColumnProofGallons(120, 100)).toBe(15.8);
    expect(table3ColumnProofGallons(120, 1000)).toBe(157.8);
  });

  it('matches published values at 130 proof', () => {
    expect(table3ColumnProofGallons(130, 100)).toBe(17.3);
  });

  it('matches published values at 150 proof', () => {
    expect(table3ColumnProofGallons(150, 100)).toBe(20.5);
    expect(table3ColumnProofGallons(150, 500)).toBe(102.7);
  });

  it('matches published values at 190 proof', () => {
    expect(table3ColumnProofGallons(190, 100)).toBe(28.0);
    expect(table3ColumnProofGallons(190, 1000)).toBe(279.6);
  });

  it('matches published values at 200 proof', () => {
    expect(table3ColumnProofGallons(200, 100)).toBe(30.3);
    expect(table3ColumnProofGallons(200, 1000)).toBe(302.6);
  });
});

describe('weight decomposition', () => {
  it('decomposes 321.5 lb per CFR method', () => {
    const parts = decomposeWeightLb(321.5);
    expect(parts).toEqual([
      { columnWeightLb: 300, factor: 1 },
      { columnWeightLb: 200, factor: 0.1 },
      { columnWeightLb: 100, factor: 0.01 },
      { columnWeightLb: 500, factor: 0.001 },
    ]);
  });

  it('decomposes 60,378 lb per CFR method', () => {
    const parts = decomposeWeightLb(60378);
    expect(parts.some((p) => p.columnWeightLb === 60000 && p.factor === 1)).toBe(true);
    expect(parts.some((p) => p.columnWeightLb === 300 && p.factor === 1)).toBe(true);
    expect(parts.some((p) => p.columnWeightLb === 700 && p.factor === 0.1)).toBe(true);
    expect(parts.some((p) => p.columnWeightLb === 800 && p.factor === 0.01)).toBe(true);
  });
});

describe('bidirectional round trips', () => {
  const cases = [
    { proof: 80, weightLb: 500 },
    { proof: 100, weightLb: 1000 },
    { proof: 120, weightLb: 1000 },
    { proof: 130, weightLb: 2000 },
    { proof: 150, weightLb: 800 },
    { proof: 190, weightLb: 585 },
  ];

  for (const { proof, weightLb } of cases) {
    it(`lb -> gal -> lb within tolerance at ${proof} proof`, () => {
      const forward = gaugeFromWeightLb(weightLb, proof);
      const back = weightFromWineGallons(forward.wineGallons, proof);
      expect(Math.abs(back - weightLb)).toBeLessThanOrEqual(2);
    });
  }

  it('kg -> liters -> kg round trip at 120 proof', () => {
    const forward = gaugeFromWeightKg(453.592, 120);
    const back = gaugeFromLiters(forward.liters, 120);
    expect(Math.abs(back.weightKg - 453.59)).toBeLessThanOrEqual(0.5);
  });
});

describe('calculator scenarios', () => {
  it('calculates 1,000 lb at 120 proof', () => {
    const result = gaugeFromWeightLb(1000, 120);
    expect(result.proofGallons).toBe(157.8);
    expect(result.wineGallons).toBe(131.5);
    expect(result.lbPerUsGallon).toBeGreaterThan(7.5);
    expect(result.lbPerUsGallon).toBeLessThan(7.7);
  });

  it('calculates volume to weight at 130 proof / 500 gal', () => {
    const result = gaugeFromWineGallons(500, 130);
    expect(result.proofGallons).toBe(650);
    expect(result.weightLb).toBeGreaterThan(3700);
    expect(result.weightLb).toBeLessThan(3900);
  });

  it('supports gross/tare weighing workflow', () => {
    const result = gaugeFromWeighingWorkflow(2145, 145, 130);
    expect(result.netWeightLb).toBe(2000);
    expect(result.proof).toBe(130);
    expect(result.proofGallons).toBeGreaterThan(300);
  });
});
