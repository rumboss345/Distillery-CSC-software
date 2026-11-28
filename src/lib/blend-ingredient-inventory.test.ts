import { describe, expect, it } from 'vitest';
import type { BlendIngredientInput, InventoryItem } from '../types';
import { refreshBlendIngredientsFromInventory } from './blend-ingredient-inventory';

function inv(partial: Partial<InventoryItem> & Pick<InventoryItem, 'id' | 'name' | 'category' | 'unit'>): InventoryItem {
  return {
    quantity: 1,
    reorder_level: 0,
    notes: '',
    package_size_ml: null,
    created_at: '',
    updated_at: '',
    cost_per_unit: null,
    ...partial,
  };
}

function row(partial: Partial<BlendIngredientInput> & Pick<BlendIngredientInput, 'name' | 'amount' | 'unit'>): BlendIngredientInput {
  return {
    ingredient_type: 'flavoring',
    abv: null,
    density_g_per_ml: null,
    density_assumption: null,
    sugar_mass_fraction: null,
    solids_mass_fraction: null,
    density_temp_c: null,
    spec_status: null,
    spec_source: null,
    cost_per_unit: null,
    lot_number: '',
    inventory_item_id: null,
    inventory_category: 'flavoring',
    notes: '',
    ...partial,
  };
}

describe('refreshBlendIngredientsFromInventory', () => {
  it('updates density and spec fields from linked inventory', () => {
    const inventory = new Map<number, InventoryItem>([
      [3, inv({
        id: 3,
        name: 'Vanilla Extract (current)',
        category: 'flavoring',
        unit: 'ml',
        density_g_per_ml: 0.92,
        abv: 35,
        sugar_mass_fraction: 0.1,
        spec_status: 'verified',
        density_reference: 'Supplier 2025',
      })],
    ]);
    const ingredients = [
      row({
        name: 'Vanilla Extract (stale)',
        amount: 100,
        unit: 'ml',
        inventory_item_id: 3,
        density_g_per_ml: 0.88,
        density_assumption: 'water',
        abv: 30,
      }),
    ];
    const refreshed = refreshBlendIngredientsFromInventory(ingredients, inventory);
    expect(refreshed[0].name).toBe('Vanilla Extract (current)');
    expect(refreshed[0].density_g_per_ml).toBe(0.92);
    expect(refreshed[0].density_assumption).toBeNull();
    expect(refreshed[0].abv).toBe(35);
    expect(refreshed[0].sugar_mass_fraction).toBe(0.1);
    expect(refreshed[0].spec_status).toBe('verified');
    expect(refreshed[0].spec_source).toBe('Supplier 2025');
  });

  it('keeps rows without inventory links unchanged', () => {
    const inventory = new Map<number, InventoryItem>();
    const ingredients = [row({ name: 'Water', amount: 1, unit: 'gal', ingredient_type: 'water' })];
    expect(refreshBlendIngredientsFromInventory(ingredients, inventory)).toEqual(ingredients);
  });

  it('converts amount when inventory default unit changed within the same measure mode', () => {
    const inventory = new Map<number, InventoryItem>([
      [1, inv({
        id: 1,
        name: 'Sugar',
        category: 'sugar',
        unit: 'kg',
        density_g_per_ml: 1.59,
      })],
    ]);
    const ingredients = [
      row({
        name: 'Sugar',
        amount: 10,
        unit: 'lbs',
        ingredient_type: 'sugar',
        inventory_item_id: 1,
      }),
    ];
    const refreshed = refreshBlendIngredientsFromInventory(ingredients, inventory);
    expect(refreshed[0].unit).toBe('kg');
    expect(refreshed[0].amount).toBeCloseTo(4.5359, 3);
  });
});