import { describe, expect, it } from 'vitest';
import {
  ingredientVolumeGal,
  ingredientWeightLbs,
  inferMeasureMode,
  measureAlternate,
  recommendMeasureMode,
  spiritDensityGPerMl,
  spiritLbsPerGallon,
  spiritMeasureAlternate,
  amountFromSpiritVolumeGal,
  convertIngredientAmount,
  convertSpiritAmount,
  spiritVolumeGalFromAmount,
  filterInventoryForBlendIngredient,
  formatBlendRecipeAdditive,
  formatBlendRecipeSpiritPull,
  formatReviewVolume,
  formatReviewWeight,
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

  it('converts sugar weight with the dissolved sucrose factor 0.6219 ml/g', () => {
    const gal = ingredientVolumeGal({ amount: 10, unit: 'lbs', ingredient_type: 'sugar' });
    const expected = (10 * 453.59237 * 0.6219) / (3.785411784 * 1000);
    expect(gal).toBeCloseTo(expected, 6);
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

  it('converts water volume with the TTB §30.41 factor', () => {
    expect(ingredientWeightLbs({ amount: 1, unit: 'gal', ingredient_type: 'water' })).toBeCloseTo(1 / 0.120074, 6);
  });

  it('weighs Class I color at specific gravity 1.30', () => {
    const lbs = ingredientWeightLbs({ amount: 1, unit: 'gal', ingredient_type: 'color' });
    expect(lbs).toBeCloseTo((3.785411784 * 1000 * 1.3) / 453.59237, 6);
  });

  it('weighs alcoholic flavoring with Table 3 instead of water', () => {
    const lbs = ingredientWeightLbs({ amount: 1, unit: 'gal', ingredient_type: 'flavoring', abv: 40 });
    expect(lbs).toBe(spiritWeightLbsFromVolumeGal(1, 40));
    expect(lbs).toBeLessThan(ingredientWeightLbs({ amount: 1, unit: 'gal', ingredient_type: 'water' }));
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

  it('derives spirit density from Table 3 so it falls as ABV rises', () => {
    expect(spiritDensityGPerMl(93)).toBeLessThan(spiritDensityGPerMl(40));
    expect(spiritDensityGPerMl(40)).toBeLessThan(spiritDensityGPerMl(0));
    expect(spiritDensityGPerMl(0)).toBeCloseTo((spiritLbsPerGallon(0) * 453.59237) / (3.785411784 * 1000), 8);
    expect(spiritDensityGPerMl(93)).toBeCloseTo((spiritLbsPerGallon(93) * 453.59237) / (3.785411784 * 1000), 8);
  });

  it('converts spirit volume to weight via TTB Table No. 3', () => {
    const lbs = spiritWeightLbsFromVolumeGal(10, 40);
    expect(lbs).toBe(weightFromWineGallons(10, proofFromAbv(40)));
    expect(spiritLbsPerGallon(93) * 1000).toBeCloseTo(weightFromWineGallons(1000, proofFromAbv(93)), 2);
    expect(spiritLbsPerGallon(93)).toBeGreaterThan(6.8);
    expect(spiritLbsPerGallon(93)).toBeLessThan(6.9);
  });

  it('matches Table No. 3 for 85.27 gal at 93% ABV', () => {
    expect(spiritWeightLbsFromVolumeGal(85.27, 93)).toBe(584.75);
    expect(formatSpiritPullWeightLbs(85.27, 93)).toBe('584.8 lbs');
  });

  it('writes a spirit pull back into gallons or pounds', () => {
    expect(amountFromSpiritVolumeGal(87.833, 'gal', 90)).toBeCloseTo(87.833, 3);
    const lbs = amountFromSpiritVolumeGal(87.833, 'lbs', 90);
    expect(spiritVolumeGalFromAmount(lbs, 'lbs', 90)).toBeCloseTo(87.833, 1);
    expect(spiritVolumeGalFromAmount(amountFromSpiritVolumeGal(10, 'fl oz', 40), 'fl oz', 40)).toBeCloseTo(10, 2);
  });

  it('shows alternate measure for spirit', () => {
    const alt = spiritMeasureAlternate(10, 'gal', 40);
    expect(alt).not.toBeNull();
    expect(alt!.label).toContain('lbs');
  });

  it('formats a review line in gallons, liters, pounds, and kilograms', () => {
    expect(formatReviewVolume(10)).toBe('10.00 gal · 37.9 L');
    expect(formatReviewWeight(10)).toBe('10.00 lb · 4.54 kg');
    expect(formatReviewVolume(0)).toBe('—');
    expect(formatReviewWeight(0)).toBe('—');
  });

  it('steps a review amount below 1 into the next smaller unit', () => {
    const pointThreeFourLiters = 0.34 * 1000 / 3785.41;
    expect(formatReviewVolume(pointThreeFourLiters)).toBe('11.5 fl oz · 340 ml');
    expect(formatReviewVolume(0.5)).toBe('64 fl oz · 1.9 L');
    expect(formatReviewWeight(0.34)).toBe('154 g');
    expect(formatReviewWeight(1.5)).toBe('1.50 lb · 680 g');
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

describe('convertIngredientAmount', () => {
  it('converts water gallons to pounds with the TTB factor and back', () => {
    const lbs = convertIngredientAmount({ amount: 10, unit: 'gal', ingredient_type: 'water' }, 'lbs');
    expect(lbs).toBeCloseTo(10 / 0.120074, 3);
    const gal = convertIngredientAmount({ amount: lbs, unit: 'lbs', ingredient_type: 'water' }, 'gal');
    expect(gal).toBeCloseTo(10, 2);
  });

  it('converts dissolved sugar pounds to gallons and back', () => {
    const gal = convertIngredientAmount({ amount: 10, unit: 'lbs', ingredient_type: 'sugar' }, 'gal');
    expect(gal).toBeCloseTo(ingredientVolumeGal({ amount: 10, unit: 'lbs', ingredient_type: 'sugar' }), 3);
    const lbs = convertIngredientAmount({ amount: gal, unit: 'gal', ingredient_type: 'sugar' }, 'lbs');
    expect(lbs).toBeCloseTo(10, 2);
  });

  it('converts within volume without changing the gallons', () => {
    const ml = convertIngredientAmount({ amount: 1, unit: 'gal', ingredient_type: 'flavoring' }, 'ml');
    expect(ml).toBeCloseTo(3785.41, 2);
    expect(convertIngredientAmount({ amount: ml, unit: 'ml', ingredient_type: 'flavoring' }, 'gal')).toBeCloseTo(1, 3);
  });

  it('leaves a zero amount at zero', () => {
    expect(convertIngredientAmount({ amount: 0, unit: 'gal', ingredient_type: 'water' }, 'lbs')).toBe(0);
  });
});

describe('convertSpiritAmount', () => {
  it('converts a spirit pull between gallons and pounds at its ABV', () => {
    const lbs = convertSpiritAmount(10, 'gal', 'lbs', 40);
    expect(lbs).toBeCloseTo(spiritWeightLbsFromVolumeGal(10, 40), 2);
    expect(convertSpiritAmount(lbs, 'lbs', 'gal', 40)).toBeCloseTo(10, 1);
  });

  it('converts pounds to kilograms without needing a new density', () => {
    expect(convertSpiritAmount(10, 'lbs', 'kg', 93)).toBeCloseTo(10 / 2.20462, 3);
  });

  it('keeps the entered amount when ABV is missing and the mode changes', () => {
    expect(convertSpiritAmount(12, 'gal', 'lbs', 0)).toBe(12);
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
