import { describe, expect, it } from 'vitest';
import {
  blendDesignerOtherCategories,
  defaultBlendDesignerOtherCategory,
  otherRowFormulationKind,
} from './blend-designer-rows';

describe('blend-designer-rows', () => {
  it('prefers flavoring as the default other-ingredient category', () => {
    expect(defaultBlendDesignerOtherCategory(['sugar', 'Flavoring', 'packaging'])).toBe('Flavoring');
  });

  it('maps water inventory category to water formulation kind', () => {
    expect(otherRowFormulationKind({
      inventory_category: 'water',
      name: '',
      abv: '',
      sucrosePercent: '',
      density_g_per_ml: null,
      density_assumption: null,
    })).toBe('water');
  });

  it('excludes sugar and water from other-ingredient category lists', () => {
    expect(blendDesignerOtherCategories(['sugar', 'flavoring', 'water', 'syrup'])).toEqual(['flavoring', 'syrup']);
  });
});
