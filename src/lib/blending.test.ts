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
  filterInventoryForBlendIngredient,
  formatBlendRecipeAdditive,
  formatBlendRecipeSpiritPull,
  formatSpiritPullWeightLbs,
  unitOptionsForBlendIngredient,
  spiritWeightLbsFromVolumeGal,
  SPIRIT_MEASURE_RECOMMENDATION,
  toGallonsFromVolumeUnit,
  toLbs,
} from './blending';
import { proofFromAbv, weightFromWineGallons } from '../services/spirit-gauging';

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

  it('converts sugar weight using bulk density from blending workbook', () => {
    const gal = ingredientVolumeGal({ amount: 10, unit: 'lbs', ingredient_type: 'sugar' });
    expect(gal).toBeGreaterThan(0.7);
    expect(gal).toBeLessThan(0.8);
  });

  it('converts syrup weight using CS1 bulk density', () => {
    const gal = ingredientVolumeGal({ amount: 16.3, unit: 'lbs', ingredient_type: 'syrup' });
    expect(gal).toBeGreaterThan(1.4);
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

  it('converts spirit volume to weight via TTB Table No. 3', () => {
    const lbs = spiritWeightLbsFromVolumeGal(10, 40);
    expect(lbs).toBe(weightFromWineGallons(10, proofFromAbv(40)));
    expect(spiritLbsPerGallon(93)).toBeCloseTo(weightFromWineGallons(1, proofFromAbv(93)), 2);
  });

  it('matches Table No. 3 for 85.27 gal at 93% ABV', () => {
    expect(spiritWeightLbsFromVolumeGal(85.27, 93)).toBe(584.75);
    expect(formatSpiritPullWeightLbs(85.27, 93)).toBe('584.8 lbs');
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

describe('blend recipe inventory helpers', () => {
  const items = [
    { id: 1, name: 'Raw Cane Sugar', category: 'sugar', unit: 'lbs', quantity: 10, reorder_level: 1, notes: '', created_at: '', updated_at: '' },
    { id: 2, name: '750ml Bottles', category: 'packaging', unit: 'each', quantity: 100, reorder_level: 10, notes: '', created_at: '', updated_at: '' },
    { id: 3, name: 'Vanilla', category: 'flavoring', unit: 'ml', quantity: 5000, reorder_level: 500, notes: '', created_at: '', updated_at: '' },
  ];

  it('filters inventory by additive type and excludes water', () => {
    expect(filterInventoryForBlendIngredient(items, 'water')).toEqual([]);
    expect(filterInventoryForBlendIngredient(items, 'sugar').map((i) => i.name)).toEqual(['Raw Cane Sugar']);
    expect(filterInventoryForBlendIngredient(items, 'flavoring').map((i) => i.name)).toEqual(['Vanilla']);
  });

  it('includes current unit in selectable unit options', () => {
    expect(unitOptionsForBlendIngredient({ ingredient_type: 'sugar', unit: 'kg' })).toContain('kg');
  });
});

describe('formatBlendRecipeAdditive', () => {
  it('shows weight and volume for water by gallon', () => {
    const line = formatBlendRecipeAdditive({
      amount: 116.8,
      unit: 'gal',
      name: 'Proofing water',
      ingredient_type: 'water',
    });
    expect(line).toContain('Proofing water');
    expect(line).toContain('116.8 gal');
    expect(line).toContain('lbs');
  });

  it('shows weight and volume for sugar by pound', () => {
    const line = formatBlendRecipeAdditive({
      amount: 400,
      unit: 'lbs',
      name: 'White sugar',
      ingredient_type: 'sugar',
    });
    expect(line).toContain('400 lbs');
    expect(line).toContain('gal');
  });

  it('shows weight and volume for flavoring by ml', () => {
    const line = formatBlendRecipeAdditive({
      amount: 2760,
      unit: 'ml',
      name: 'Natural coconut flavor',
      ingredient_type: 'flavoring',
    });
    expect(line).toContain('2760 ml');
    expect(line).toContain('lbs');
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
