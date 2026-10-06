import { describe, expect, it } from 'vitest';
import { rowsToCsv } from './reporting/csv';
import { RECIPE_EXPORT_HEADERS, buildRecipeExportRows } from './recipe-export';
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
    ingredients: [{
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
    }],
    current_version_number: 2,
  };
}

describe('buildRecipeExportRows', () => {
  it('writes wash, gin, and blend recipes into one sheet', () => {
    const rows = buildRecipeExportRows({ wash: [wash()], gin: [gin()], blend: [blend()] });
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe('Wash');
    expect(rows[0][RECIPE_EXPORT_HEADERS.indexOf('Sugar lbs')]).toBe(400);
    expect(rows[0][RECIPE_EXPORT_HEADERS.indexOf('Nutrients')]).toContain('DAP');
    expect(rows[1][0]).toBe('Gin');
    expect(rows[1][RECIPE_EXPORT_HEADERS.indexOf('Botanicals')]).toContain('Juniper berries');
    expect(rows[2][0]).toBe('Blend');
    expect(rows[2][RECIPE_EXPORT_HEADERS.indexOf('Source')]).toBe('Tank');
    expect(rows[2][RECIPE_EXPORT_HEADERS.indexOf('Version')]).toBe(2);
    expect(rows[2][RECIPE_EXPORT_HEADERS.indexOf('Spirit pulls')]).toContain('High wines');
    expect(rows[2][RECIPE_EXPORT_HEADERS.indexOf('Additives')]).toContain('Proofing water');

    const csv = rowsToCsv([...RECIPE_EXPORT_HEADERS], rows);
    expect(csv.split('\n')[0]).toContain('Kind,Name,Product');
    expect(csv).toContain('Molasses Wash');
    expect(csv).toContain('London Dry');
    expect(csv).toContain('Silver Rum');
  });

  it('returns no rows when nothing is saved', () => {
    expect(buildRecipeExportRows({})).toEqual([]);
  });
});
