import { describe, expect, it } from 'vitest';
import { computeAlcoholDilution } from './alcohol-dilution';
import { ingredientWeightLbs, spiritDensityGPerMl, spiritWeightLbsFromVolumeGal } from './blending';
import { LITERS_PER_US_GALLON, proofFromAbv, weightFromWineGallons } from '../services/spirit-gauging';
import {
  compensateProofingWater,
  proofingWaterForSameBatchSize,
  spiritVolumeForSourceAbv,
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
    expect(result.volumeGal).toBeLessThan(20);
    expect(result.abv).toBeGreaterThan(40);
    expect(result.pureAlcoholGal).toBe(8);
    expect(result.density).toBeCloseTo(spiritDensityGPerMl(result.abv), 3);
    expect(result.density!).toBeGreaterThan(0.9);
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

  it('includes sugar volume when calculating final ABV', () => {
    const withoutSugar = computeTheoreticalBlend(
      [{ volumeGal: 88.29, abv: 93 }],
      [{ ingredientType: 'water', name: 'Water', amount: 120.38, unit: 'gal' }],
    );
    const withSugar = computeTheoreticalBlend(
      [{ volumeGal: 88.29, abv: 93 }],
      [
        { ingredientType: 'water', name: 'Water', amount: 120.38, unit: 'gal' },
        { ingredientType: 'sugar', name: 'White sugar', amount: 406, unit: 'lbs' },
        { ingredientType: 'flavoring', name: 'Coconut', amount: 2760, unit: 'ml' },
      ],
    );
    expect(withSugar.abv).toBeLessThan(withoutSugar.abv);
    expect(withSugar.abv).toBeGreaterThan(30);
    expect(withSugar.abv).toBeLessThan(40);
  });

  it('includes alcoholic additives in pure alcohol', () => {
    const result = computeTheoreticalBlend(
      [{ volumeGal: 10, abv: 40 }],
      [{ ingredientType: 'flavoring', name: 'Vanilla', amount: 1, unit: 'gal', abv: 10 }],
    );
    expect(result.volumeGal).toBeLessThan(11);
    expect(result.pureAlcoholGal).toBeCloseTo(4.1, 3);
    expect(result.abv).toBeGreaterThan(37);
  });
});

describe('solveWaterForTargetAbv', () => {
  it('matches spirit proofing for 66.63 gal at 92.4% brought to 40%', () => {
    const spiritGal = 66.63;
    const abv = 92.4;
    const dilution = computeAlcoholDilution({
      actualAbvPercent: abv,
      targetAbvPercent: 40,
      volumeLiters: spiritGal * LITERS_PER_US_GALLON,
      volumeBasis: 'before',
    });
    const solved = solveWaterForTargetAbv([{ volumeGal: spiritGal, abv }], [], 40);
    expect(dilution).not.toBeNull();
    expect(solved).not.toBeNull();
    expect(solved!.waterGal * LITERS_PER_US_GALLON).toBeCloseTo(dilution!.waterVolumeLiters, 1);
    expect(solved!.result.abv).toBe(40);
    expect(solved!.result.volumeGal).toBeCloseTo(spiritGal * (abv / 40), 2);
    const gauged = computeTheoreticalBlend(
      [{ volumeGal: spiritGal, abv }],
      [{ ingredientType: 'water', name: 'Proofing water', amount: solved!.waterGal, unit: 'gal' }],
      40,
    );
    expect(gauged.volumeGal).toBeCloseTo(solved!.result.volumeGal, 2);
    expect(gauged.abv).toBeCloseTo(40, 1);
    const finishedLb = spiritWeightLbsFromVolumeGal(spiritGal, abv)
      + ingredientWeightLbs({ amount: solved!.waterGal, unit: 'gal', ingredient_type: 'water' });
    expect(finishedLb).toBeCloseTo(weightFromWineGallons(solved!.result.volumeGal, proofFromAbv(40)), 0);
    expect(finishedLb).toBeGreaterThan(1184);
  });

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

  it('accounts for sugar volume when solving proofing water', () => {
    const withoutSugar = solveWaterForTargetAbv(
      [{ volumeGal: 88.29, abv: 93 }],
      [],
      35,
    );
    const withSugar = solveWaterForTargetAbv(
      [{ volumeGal: 88.29, abv: 93 }],
      [{ ingredientType: 'sugar', name: 'White sugar', amount: 406, unit: 'lbs' }],
      35,
    );
    expect(withSugar).not.toBeNull();
    expect(withSugar!.waterGal).toBeLessThan(withoutSugar!.waterGal);
    expect(withSugar!.result.abv).toBeCloseTo(35, 0);
  });
});

describe('spirit pull follows source ABV', () => {
  it('increases the pull when the source is weaker and keeps the batch size and ABV', () => {
    const recipeGal = 85;
    const recipeAbv = 93;
    const sourceAbv = 90;
    const pull = spiritVolumeForSourceAbv(recipeGal, recipeAbv, sourceAbv);
    expect(pull).toBeCloseTo((recipeGal * recipeAbv) / sourceAbv, 3);
    expect(pull * sourceAbv).toBeCloseTo(recipeGal * recipeAbv, 1);
    const recipeWater = 120;
    const water = proofingWaterForSameBatchSize(recipeGal, pull, recipeWater);
    expect(water.shortfallGal).toBe(0);
    expect(water.waterGal + pull).toBeCloseTo(recipeWater + recipeGal, 2);
    const solved = solveWaterForTargetAbv([{ volumeGal: pull, abv: sourceAbv }], [], 35);
    expect(solved).not.toBeNull();
    expect(solved!.result.abv).toBeCloseTo(35, 1);
    expect(solved!.result.volumeGal).toBeGreaterThan(pull);
  });

  it('decreases the pull when the source is stronger than the recipe', () => {
    const pull = spiritVolumeForSourceAbv(85, 93, 95);
    expect(pull).toBeLessThan(85);
    expect(pull * 95).toBeCloseTo(85 * 93, 1);
    const water = proofingWaterForSameBatchSize(85, pull, 40);
    expect(water.waterGal).toBeGreaterThan(40);
    expect(water.waterGal + pull).toBeCloseTo(40 + 85, 2);
  });

  it('leaves the pull unchanged when the source matches the recipe', () => {
    expect(spiritVolumeForSourceAbv(85, 93, 93)).toBe(85);
    expect(spiritVolumeForSourceAbv(85, 93, 93.04)).toBe(85);
  });

  it('reports a shortfall when proofing water cannot absorb the extra spirit', () => {
    const pull = spiritVolumeForSourceAbv(80, 93, 70);
    const water = proofingWaterForSameBatchSize(80, pull, 5);
    expect(water.waterGal).toBe(0);
    expect(water.shortfallGal).toBeGreaterThan(0);
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
