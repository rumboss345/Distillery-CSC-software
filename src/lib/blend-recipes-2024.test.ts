import { describe, expect, it } from 'vitest';
import { BLEND_RECIPES_2024 } from './blend-recipes-2024';

describe('blend-recipes-2024', () => {
  it('includes every formula from RECEIPES 2024', () => {
    expect(BLEND_RECIPES_2024.length).toBe(30);
    const names = BLEND_RECIPES_2024.map((recipe) => recipe.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Dark Rum (60 cases)');
    expect(names).toContain('Gin — Offshore');
    expect(names).toContain('Bobos Vodka');
  });

  it('stores rum batches with spirit pulls and additives', () => {
    const darkRum = BLEND_RECIPES_2024.find((recipe) => recipe.name === 'Dark Rum (60 cases)');
    expect(darkRum?.spirit_sources[0].volume_gal).toBeGreaterThan(0);
    expect(darkRum?.ingredients.some((item) => item.ingredient_type === 'sugar')).toBe(true);
    expect(darkRum?.ingredients.some((item) => item.name === 'YT75' && item.amount === 1741)).toBe(true);
    expect(darkRum?.notes).toContain('60 cases');
    expect(darkRum?.notes).toContain('Liqour Blending FINAL (003).xlsx');
  });
});
