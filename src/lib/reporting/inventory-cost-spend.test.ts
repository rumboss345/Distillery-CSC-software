import { describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '../../types';

vi.mock('../../db/queries', () => ({
  getInventoryItems: vi.fn(),
}));

import { getInventoryItems } from '../../db/queries';
import {
  findInventoryItemForCosting,
  spendFromInventoryLookup,
  type InventoryCostEntry,
} from './inventory-cost-spend';

const index: InventoryCostEntry[] = [
  { id: 12, key: 'syrup::cs1', category: 'syrup', currentCost: 3, changes: [] },
];

describe('inventory-cost-spend', () => {
  it('converts botanical grams before applying per-lb cost', () => {
    vi.mocked(getInventoryItems).mockReturnValue([
      { id: 20, category: 'botanicals', name: 'Juniper', unit: 'lbs', cost_per_unit: 12 } as InventoryItem,
    ]);
    const spend = spendFromInventoryLookup(
      453.592,
      'g',
      { category: 'botanicals', name: 'Juniper' },
      '2026-06-01',
      index,
    );
    expect(spend).toBeCloseTo(12, 0);
  });

  it('finds syrup by partial name across categories', () => {
    vi.mocked(getInventoryItems).mockReturnValue([
      { id: 12, category: 'syrup', name: 'CS1 syrup', unit: 'gal', cost_per_unit: 3 } as InventoryItem,
    ]);
    const item = findInventoryItemForCosting({ category: 'syrup', name: 'CS1' }, index);
    expect(item?.name).toBe('CS1 syrup');
    const spend = spendFromInventoryLookup(3785.411784, 'ml', { name: 'CS1' }, '2026-06-01', index, 3);
    expect(spend).toBeCloseTo(3, 0);
  });
});