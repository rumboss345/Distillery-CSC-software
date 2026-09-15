import { describe, expect, it } from 'vitest';
import {
  compensateProofingWater,
  computeBatchCorrection,
  computeTheoreticalBlend,
  reconcileMeasurements,
  scaleFormulation,
  solveSugarForTargetBrix,
  solveWaterForTargetAbv,
  spiritAbvDeltas,
  suggestCorrections,
  totalIngredientCost,
} from './blend-formulation';

describe('computeTheoreticalBlend', () => {
  it('combines multi-spirit sources without mutating inventory conceptually', () => {
    const result = computeTheoreticalBlend(
      [
        { volumeGal: 10, abv: 60 },
        { volumeGal: 5, abv: 40 },
      ],
      [{ ingredientType: 'water', name: 'Water', amount: 5, unit: 'gal' }],
    );
    expect(result.volumeGal).toBe(20);
    expect(result.abv).toBe(40);
    expect(result.pureAlcoholGal).toBe(8);
  });

  it('marks density unreliable when sugar or flavor is present', () => {
    const result = computeTheoreticalBlend(
      [{ volumeGal: 10, abv: 40 }],
      [{ ingredientType: 'sugar', name: 'Cane', amount: 2, unit: 'lbs' }],
    );
    expect(result.densityFromAbvUnreliable).toBe(true);
    expect(result.density).toBeNull();
    expect(result.brix).not.toBeNull();
  });
});

describe('solveWaterForTargetAbv', () => {
  it('calculates proofing water for target ABV', () => {
    const solved = solveWaterForTargetAbv(
      [{ volumeGal: 10, abv: 60 }],
      [],
      40,
    );
    expect(solved).not.toBeNull();
    expect(solved!.waterGal).toBeGreaterThan(0);
    expect(solved!.result.abv).toBeCloseTo(40, 0);
  });
});

describe('spirit ABV compensation', () => {
  it('detects recipe vs tank ABV differences', () => {
    const deltas = spiritAbvDeltas(
      [{ abv: 93, spirit_label: '93% rum' }],
      [{ abv: 91, volume_gal: 85 }],
    );
    expect(deltas).toHaveLength(1);
    expect(deltas[0].recipeAbv).toBe(93);
    expect(deltas[0].actualAbv).toBe(91);
  });

  it('recalculates water when tank ABV is lower than recipe', () => {
    const recipeWater = 100;
    const atRecipe = solveWaterForTargetAbv([{ volumeGal: 85, abv: 93 }], [], 35);
    const compensation = compensateProofingWater(
      [{ abv: 93, spirit_label: '93% rum' }],
      [{ volumeGal: 85, abv: 91 }],
      [],
      35,
      recipeWater,
    );
    expect(compensation).not.toBeNull();
    expect(compensation!.waterGal).toBeLessThan(atRecipe!.waterGal);
  });

  it('recalculates water when tank ABV is higher than recipe', () => {
    const atRecipe = solveWaterForTargetAbv([{ volumeGal: 85, abv: 93 }], [], 35);
    const compensation = compensateProofingWater(
      [{ abv: 93, spirit_label: '93% rum' }],
      [{ volumeGal: 85, abv: 95 }],
      [],
      35,
      100,
    );
    expect(compensation).not.toBeNull();
    expect(compensation!.waterGal).toBeGreaterThan(atRecipe!.waterGal);
  });
});

describe('solveSugarForTargetBrix', () => {
  it('suggests sugar for target Brix', () => {
    const solved = solveSugarForTargetBrix(
      [{ volumeGal: 10, abv: 40 }],
      [{ ingredientType: 'water', name: 'Water', amount: 0, unit: 'gal' }],
      8,
    );
    expect(solved).not.toBeNull();
    expect(solved!.sugarLbs).toBeGreaterThan(0);
  });
});

describe('scaleFormulation', () => {
  it('scales spirits and additives', () => {
    const scaled = scaleFormulation(
      [{ volumeGal: 10, abv: 50 }],
      [{ ingredientType: 'water', name: 'Water', amount: 5, unit: 'gal' }],
      2,
    );
    expect(scaled.spirits[0].volumeGal).toBe(20);
    expect(scaled.additives[0].amount).toBe(10);
  });
});

describe('reconcileMeasurements', () => {
  it('prefers lab values when provided', () => {
    const r = reconcileMeasurements(
      { volumeGal: 20, abv: 40, density: 0.83, brix: null },
      { abv: 38.5, volumeGal: 19.8 },
    );
    expect(r.effectiveSource).toBe('lab');
    expect(r.effective.abv).toBe(38.5);
    expect(r.deltas.abv).toBe(-1.5);
  });

  it('retains theoretical when no lab values', () => {
    const r = reconcileMeasurements(
      { volumeGal: 20, abv: 40, density: null, brix: 5 },
      {},
    );
    expect(r.effectiveSource).toBe('theoretical');
    expect(r.effective.abv).toBe(40);
  });
});

describe('suggestCorrections', () => {
  it('suggests water when lab ABV exceeds target', () => {
    const theoretical = computeTheoreticalBlend([{ volumeGal: 10, abv: 60 }], []);
    const suggestions = suggestCorrections(theoretical, { abv: 45 }, 40, null);
    expect(suggestions.some((s) => s.field === 'water')).toBe(true);
  });
});

describe('computeBatchCorrection', () => {
  it('calculates water to add when batch is over target ABV', () => {
    const result = computeBatchCorrection(100, 41.2, 40);
    expect(result).not.toBeNull();
    expect(result!.onTarget).toBe(false);
    expect(result!.actions).toHaveLength(1);
    expect(result!.actions[0].ingredientType).toBe('water');
    expect(result!.actions[0].amount).toBeGreaterThan(0);
    expect(result!.actions[0].instruction).toContain('41.2%');
    expect(result!.actions[0].instruction).toContain('40.0%');
  });

  it('reports on-target when within tolerance', () => {
    const result = computeBatchCorrection(100, 40.1, 40);
    expect(result!.onTarget).toBe(true);
    expect(result!.actions).toHaveLength(0);
  });

  it('calculates spirit to add when batch is under target ABV', () => {
    const result = computeBatchCorrection(100, 38, 40, { spiritProofAbv: 80 });
    expect(result!.actions.some((a) => a.ingredientType === 'spirit')).toBe(true);
    expect(result!.actions[0].amount).toBeGreaterThan(0);
  });
});

describe('totalIngredientCost', () => {
  it('sums line costs', () => {
    expect(totalIngredientCost([
      { ingredientType: 'sugar', name: 'Sugar', amount: 10, unit: 'lbs', costPerUnit: 0.5 },
    ])).toBe(5);
  });
});
