import { describe, expect, it } from 'vitest';
import { buildRecipeExport } from './recipe-export';
import { importRecipeCsv, parseRecipeAmount } from './recipe-import';
import { rowsToCsv } from './reporting/csv';
import type { BlendRecipeView, GinRecipe, RecipeView } from '../types';

function wash(): RecipeView {
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
    target_final_brix: 2.5,
    notes: 'Heat slowly',
    created_at: '',
    updated_at: '',
    nutrients: [{
      id: 1,
      recipe_id: 1,
      name: 'DAP',
      amount: 1.256,
      unit: 'l',
      inventory_item_id: null,
      notes: '',
    }],
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
      entered_amount: 1.256,
      entered_unit: 'l',
    }],
    ingredients: [{
      id: 1,
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
    }],
    current_version_number: 2,
  };
}

describe('parseRecipeAmount', () => {
  it('reads a liter amount', () => {
    expect(parseRecipeAmount('1.256 L')).toEqual({ amount: 1.256, unit: 'l', abv: null });
  });

  it('reads milliliters and ABV', () => {
    expect(parseRecipeAmount('1256 ml @ 80.00%')).toEqual({ amount: 1256, unit: 'ml', abv: 80 });
  });
});

describe('importRecipeCsv', () => {
  it('reads an exported sheet back, with small liter amounts kept as milliliters', () => {
    const sheet = buildRecipeExport({ wash: [wash()], gin: [gin()], blend: [blend()] });
    const imported = importRecipeCsv(rowsToCsv(sheet.headers, sheet.rows));
    expect(imported.errors).toEqual([]);

    expect(imported.wash[0]).toMatchObject({
      name: 'Molasses Wash',
      spirit_type: 'Rum',
      grain_type: 'Blackstrap',
      grain_lbs: 400,
      water_gal: 150,
      yeast_strain: 'DADY',
      yeast_lbs: 1.5,
      target_brix: 16,
      target_final_brix: 2.5,
      notes: 'Heat slowly',
    });
    expect(imported.wash[0].nutrients).toEqual([
      { name: 'DAP', amount: 1256, unit: 'ml', inventory_item_id: null, notes: '' },
    ]);

    expect(imported.gin[0].botanicals).toEqual([
      { name: 'Juniper berries', amount: 0, weight: 500, weight_unit: 'g' },
    ]);

    expect(imported.blend[0].spirit_sources[0]).toMatchObject({
      spirit_label: 'High wines',
      abv: 80,
      entered_amount: 1256,
      entered_unit: 'ml',
    });
    expect(imported.blend[0].spirit_sources[0].volume_gal).toBeCloseTo(1256 / 3785.411784, 6);
    expect(imported.blend[0].ingredients[0]).toMatchObject({
      ingredient_type: 'flavoring',
      name: 'Vanilla',
      amount: 1256,
      unit: 'ml',
    });
  });

  it('keeps 1.256 L when that is what the file says', () => {
    const csv = [
      'Kind,Name,Vanilla (flavoring)',
      'Blend,House Vanilla,1.256 L',
    ].join('\n');
    const imported = importRecipeCsv(csv);
    expect(imported.errors).toEqual([]);
    expect(imported.blend[0].ingredients[0]).toMatchObject({
      name: 'Vanilla',
      amount: 1.256,
      unit: 'l',
      ingredient_type: 'flavoring',
    });
  });

  it('rejects a column that does not say what the ingredient is', () => {
    const csv = [
      'Kind,Name,Blackstrap',
      'Wash,Molasses,400 lbs',
    ].join('\n');
    const imported = importRecipeCsv(csv);
    expect(imported.wash).toEqual([]);
    expect(imported.errors[0]).toContain('Blackstrap (wash sugar)');
  });
});
