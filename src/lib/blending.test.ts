import { describe, expect, it } from 'vitest';
import {
  ingredientVolumeGal,
  ingredientWeightLbs,
  inferMeasureMode,
  measureAlternate,
  recommendMeasureMode,
  spiritLbsPerGallon,
  spiritMeasureAlternate,
  spiritVolumeGalFromAmount,
  formatBlendRecipeSpiritPull,
  formatSpiritPullWeightLbs,
  spiritWeightLbsFromVolumeGal,
  SPIRIT_MEASURE_RECOMMENDATION,
  toGallonsFromVolumeUnit,
  toLbs,
} from './blending';

describe('recommendMeasureMode', () => {
  it('recommends weight for dry sugar', () => {
    expect(recommendMeasureMode('sugar').mode).toBe('weight');
  });

  it('recommends volume for water and flavoring', () => {
    expect(recommendMeasureMode('water').mode).toBe('volume');
    expect(recommendMeasureMode('flavoring').mode).toBe('volume');
  });
});

describe('ingredientVolumeGal', () => {
  it('converts volume units', () => {
    expect(ingredientVolumeGal({ amount: 1, unit: 'gal', ingredient_type: 'water' })).toBe(1);
    expect(ingredientVolumeGal({ amount: 128, unit: 'fl oz', ingredient_type: 'water' })).toBe(1);
  });

  it('converts sugar weight to approximate volume', () => {
    const gal = ingredientVolumeGal({ amount: 10, unit: 'lbs', ingredient_type: 'sugar' });
    expect(gal).toBeGreaterThan(1);
    expect(gal).toBeLessThan(1.5);
  });
});

describe('ingredientWeightLbs', () => {
  it('converts weight units to lbs', () => {
    expect(ingredientWeightLbs({ amount: 16, unit: 'oz', ingredient_type: 'sugar' })).toBe(1);
  });

  it('converts water volume to weight', () => {
    expect(ingredientWeightLbs({ amount: 1, unit: 'gal', ingredient_type: 'water' })).toBeCloseTo(8.34, 1);
  });
});

describe('measureAlternate', () => {
  it('shows volume equivalent for sugar by weight', () => {
    const alt = measureAlternate({ amount: 10, unit: 'lbs', ingredient_type: 'sugar' });
    expect(alt).not.toBeNull();
    expect(alt!.label).toContain('gal');
  });

  it('shows weight equivalent for flavoring by volume', () => {
    const alt = measureAlternate({ amount: 1, unit: 'gal', ingredient_type: 'flavoring' });
    expect(alt).not.toBeNull();
    expect(alt!.label).toContain('lbs');
  });
});

describe('inferMeasureMode', () => {
  it('infers from unit', () => {
    expect(inferMeasureMode('lbs')).toBe('weight');
    expect(inferMeasureMode('gal')).toBe('volume');
  });
});

describe('spirit measurement', () => {
  it('recommends volume for tank pulls', () => {
    expect(SPIRIT_MEASURE_RECOMMENDATION.mode).toBe('volume');
  });

  it('converts spirit weight to volume using ABV-based density', () => {
    const gal = spiritVolumeGalFromAmount(100, 'lbs', 40);
    expect(gal).toBeGreaterThan(10);
    expect(gal).toBeLessThan(20);
  });

  it('converts spirit volume to weight', () => {
    const lbs = spiritWeightLbsFromVolumeGal(10, 40);
    expect(lbs).toBeCloseTo(10 * spiritLbsPerGallon(40), 1);
  });

  it('shows alternate measure for spirit', () => {
    const alt = spiritMeasureAlternate(10, 'gal', 40);
    expect(alt).not.toBeNull();
    expect(alt!.label).toContain('lbs');
  });

  it('formats blend recipe spirit pulls with weight and volume', () => {
    expect(formatSpiritPullWeightLbs(83.57, 93)).toContain('lbs');
    expect(formatBlendRecipeSpiritPull('93% rum', 83.57, 93)).toContain('93% rum');
    expect(formatBlendRecipeSpiritPull('93% rum', 83.57, 93)).toContain('gal @ 93.0%');
    expect(formatBlendRecipeSpiritPull('93% rum', 83.57, 93)).toContain('lbs');
  });
});

describe('toLbs and toGallonsFromVolumeUnit', () => {
  it('converts kg to lbs', () => {
    expect(toLbs(1, 'kg')).toBeCloseTo(2.20462, 3);
  });

  it('converts ml to gal', () => {
    expect(toGallonsFromVolumeUnit(3785.41, 'ml')).toBeCloseTo(1, 2);
  });
});
