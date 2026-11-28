import { describe, expect, it, vi } from 'vitest';
import type { BlendIngredient, BlendProduct, InventoryItem } from '../../types';
import type { ReportDateRange } from './period';

const allTime: ReportDateRange = { preset: 'all', label: 'All time', from: null, to: null };

vi.mock('../../db/queries', () => ({
  getBlendProducts: vi.fn(() => []),
  getBlendIngredients: vi.fn(() => []),
  getDistillationRuns: vi.fn(() => []),
  getInventoryItems: vi.fn(() => []),
}));

vi.mock('../../db/database', () => ({
  queryAll: vi.fn(() => []),
}));

import { getBlendIngredients, getBlendProducts, getInventoryItems } from '../../db/queries';
import { buildProductionConsumptionInRange } from './production-costing-consumption';

describe('buildProductionConsumptionInRange blend additive costing', () => {
  it('converts syrup ml against gallon inventory instead of multiplying raw ml', () => {
    const blend: BlendProduct = {
      id: 4,
      batch_number: 'BL-2026-004',
      product_name: 'GR Banana',
      status: 'executed',
      executed_at: '2026-11-04T18:04:21.000Z',
      blend_date: '2026-11-04',
    } as BlendProduct;

    const ingredients: BlendIngredient[] = [
      {
        id: 1,
        blend_product_id: 4,
        ingredient_type: 'sugar',
        name: 'Sugar',
        amount: 160.044,
        unit: 'lbs',
        inventory_item_id: null,
        cost_per_unit: 0.29,
      } as BlendIngredient,
      {
        id: 2,
        blend_product_id: 4,
        ingredient_type: 'syrup',
        name: 'CS1',
        amount: 53614.834,
        unit: 'ml',
        inventory_item_id: null,
        cost_per_unit: 3,
      } as BlendIngredient,
    ];

    const inventory: InventoryItem[] = [
      { id: 11, category: 'sugar', name: 'Sugar', unit: 'lbs', cost_per_unit: 0.29 } as InventoryItem,
      { id: 12, category: 'syrup', name: 'CS1', unit: 'gal', cost_per_unit: 3 } as InventoryItem,
    ];

    vi.mocked(getBlendProducts).mockReturnValue([blend]);
    vi.mocked(getBlendIngredients).mockReturnValue(ingredients);
    vi.mocked(getInventoryItems).mockReturnValue(inventory);

    const index = [
      { id: 11, key: 'sugar::sugar', category: 'sugar', currentCost: 0.29, changes: [] },
      { id: 12, key: 'syrup::cs1', category: 'syrup', currentCost: 3, changes: [] },
    ];

    const { rows } = buildProductionConsumptionInRange(allTime, index);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('BL-2026-004');

    const syrupGal = 53614.834 / 3785.411784;
    const expected = Math.round(((160.044 * 0.29) + (syrupGal * 3)) * 100) / 100;
    expect(rows[0].amount).toBe(expected);
    expect(rows[0].amount).toBeLessThan(100);
    expect(rows[0].amount).not.toBeCloseTo(160889.31, 0);
  });
});