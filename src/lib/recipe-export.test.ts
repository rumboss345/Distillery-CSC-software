import { describe, expect, it } from 'vitest';
import { rowsToCsv } from './reporting/csv';
import { buildRecipeExport, formatRecipeExportAmount } from './recipe-export';
import type { BlendRecipeView, GinRecipe, RecipeView } from '../types';

function wash(overrides: Partial<RecipeView> = {}): RecipeView {
  return {
    id: 1,
    name: 'Molasses Wash',
    spirit_type: 'Rum',
    grain_type: 'Blackstrap',
    grain_lbs: 400,
    water_gal: 150,
    yeast_strain: 'DADY',
    yeast_lbs: 1.5,
    target_brix: 16,
    target_final_brix: null,
    notes: 'Heat slowly',
    created_at: '',
    updated_at: '',
    nutrients: [{
      id: 1,
      recipe_id: 1,
      name: 'DAP',
      amount: 250,
      unit: 'g',
      inventory_item_id: null,
      notes: '',
    }],
    ...overrides,
  };
}

function gin(): GinRecipe {
  return {
    id: 2,
    name: 'London Dry',
    notes: '',
    created_at: '',
    updated_at: '',
    botanicals: [{
      id: 1,
      gin_recipe_id: 2,
      name: 'Juniper berries',
      amount: 0,
      weight: 500,
      weight_unit: 'g',
    }],
  };
}

function blend(): BlendRecipeView {
  return {
    id: 3,
    name: 'Silver Rum',
    product_name: 'Silver',
    target_abv: 40,
    target_brix: null,
    target_sugar_g_per_l: null,
    target_volume_gal: 100,
    scale_factor: 1,
    source_type: 'tank',
    notes: 'House blend',
    created_at: '',
    updated_at: '',
    spirit_sources: [{
      id: 1,
      blend_recipe_id: 3,
      spirit_label: 'High wines',
      volume_gal: 50,
      abv: 80,
      sort_order: 0,
    }],
    ingredients: [
      {
        id: 1,
        blend_recipe_id: 3,
        ingredient_type: 'water',
        name: 'Proofing water',
        amount: 20,
        unit: 'gal',
        abv: null,
        cost_per_unit: null,
        lot_number: '',
        inventory_item_id: null,
        notes: '',
      },
      {
        id: 2,
        blend_recipe_id: 3,
        ingredient_type: 'flavoring',
        name: 'Vanilla',
        amount: 1.256,
        unit: 'l',
        abv: null,
        cost_per_unit: null,
        lot_number: '',
        inventory_item_id: null,
        notes: '',
      },
    ],
    current_version_number: 2,
  };
}

describe('formatRecipeExportAmount', () => {
  it('writes a liter amount below 1 gallon as milliliters', () => {
    expect(formatRecipeExportAmount(1.256, 'l')).toBe('1256 ml');
    expect(formatRecipeExportAmount(1.256, 'L')).toBe('1256 ml');
  });

  it('keeps a liter amount of at least 1 gallon in liters', () => {
    expect(formatRecipeExportAmount(10, 'l')).toBe('10 L');
  });

  it('keeps gallon amounts in gallons, including amounts below 1 gallon', () => {
    expect(formatRecipeExportAmount(0.25, 'gal')).toBe('0.250 gal');
    expect(formatRecipeExportAmount(0.0364, 'gal')).toBe('0.0364 gal');
  });

  it('keeps a gallon amount of at least 1 gallon in gallons', () => {
    expect(formatRecipeExportAmount(20, 'gal')).toBe('20 gal');
  });
});

describe('buildRecipeExport', () => {
  it('puts each ingredient in its own column', () => {
    const sheet = buildRecipeExport({ wash: [wash()], gin: [gin()], blend: [blend()] });
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.headers.slice(0, 3)).toEqual(['Kind', 'Name', 'Product']);
    expect(sheet.headers).toEqual(expect.arrayContaining([
      'Blackstrap (wash sugar)',
      'Water (wash water)',
      'DADY (wash yeast)',
      'DAP (nutrient)',
      'Juniper berries (botanical)',
      'High wines (spirit)',
      'Proofing water (water)',
      'Vanilla (flavoring)',
    ]));
    expect(sheet.headers).not.toContain('Nutrients');
    expect(sheet.headers).not.toContain('Additives');
    expect(sheet.headers).not.toContain('Spirit pulls');
    expect(sheet.headers).not.toContain('Botanicals');

    const washRow = sheet.rows[0];
    expect(washRow[0]).toBe('Wash');
    expect(washRow[sheet.headers.indexOf('Blackstrap (wash sugar)')]).toBe('400 lbs');
    expect(washRow[sheet.headers.indexOf('Water (wash water)')]).toBe('150 gal');
    expect(washRow[sheet.headers.indexOf('DADY (wash yeast)')]).toBe('1.5 lbs');
    expect(washRow[sheet.headers.indexOf('DAP (nutrient)')]).toBe('250 g');
    expect(washRow[sheet.headers.indexOf('Vanilla (flavoring)')]).toBe('');

    const ginRow = sheet.rows[1];
    expect(ginRow[0]).toBe('Gin');
    expect(ginRow[sheet.headers.indexOf('Juniper berries (botanical)')]).toBe('500 g');

    const blendRow = sheet.rows[2];
    expect(blendRow[0]).toBe('Blend');
    expect(blendRow[sheet.headers.indexOf('Source')]).toBe('Tank');
    expect(blendRow[sheet.headers.indexOf('Version')]).toBe(2);
    expect(blendRow[sheet.headers.indexOf('High wines (spirit)')]).toBe('50 gal @ 80.00%');
    expect(blendRow[sheet.headers.indexOf('Proofing water (water)')]).toBe('20 gal');
    expect(blendRow[sheet.headers.indexOf('Vanilla (flavoring)')]).toBe('1256 ml');

    const csv = rowsToCsv(sheet.headers, sheet.rows);
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toContain('Blackstrap (wash sugar)');
    expect(headerLine).toContain('Vanilla (flavoring)');
    expect(headerLine).not.toContain('Additives');
    expect(csv).toContain('1256 ml');
    expect(csv).toContain('Molasses Wash');
    expect(csv).toContain('London Dry');
    expect(csv).toContain('Silver Rum');
  });

  it('shares one column when two recipes use the same ingredient', () => {
    const second = wash({
      id: 4,
      name: 'Second wash',
      nutrients: [{
        id: 2,
        recipe_id: 4,
        name: 'DAP',
        amount: 1.256,
        unit: 'l',
        inventory_item_id: null,
        notes: '',
      }],
    });
    const sheet = buildRecipeExport({ wash: [wash(), second] });
    const dapColumns = sheet.headers.filter((header) => header === 'DAP (nutrient)' || header.startsWith('DAP (nutrient) '));
    expect(dapColumns).toEqual(['DAP (nutrient)']);
    expect(sheet.rows[0][sheet.headers.indexOf('DAP (nutrient)')]).toBe('250 g');
    expect(sheet.rows[1][sheet.headers.indexOf('DAP (nutrient)')]).toBe('1256 ml');
  });

  it('gives a repeated ingredient on the same recipe its own column', () => {
    const recipe = blend();
    recipe.ingredients = [
      ...recipe.ingredients,
      {
        ...recipe.ingredients[1],
        id: 3,
        name: 'Vanilla',
        amount: 10,
        unit: 'ml',
      },
    ];
    const sheet = buildRecipeExport({ blend: [recipe] });
    expect(sheet.headers).toContain('Vanilla (flavoring)');
    expect(sheet.headers).toContain('Vanilla (flavoring) 2');
    expect(sheet.rows[0][sheet.headers.indexOf('Vanilla (flavoring)')]).toBe('1256 ml');
    expect(sheet.rows[0][sheet.headers.indexOf('Vanilla (flavoring) 2')]).toBe('10 ml');
  });

  it('returns no rows when nothing is saved', () => {
    expect(buildRecipeExport({})).toEqual({ headers: expect.any(Array), rows: [] });
    expect(buildRecipeExport({}).rows).toEqual([]);
  });
});
