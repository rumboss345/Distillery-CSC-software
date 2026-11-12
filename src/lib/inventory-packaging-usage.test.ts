import { describe, expect, it } from 'vitest';
import {
  packagingCountsByItemId,
  packagingInventoryAdjustmentsById,
} from './inventory-packaging-usage';

describe('packaging inventory by item id', () => {
  it('aggregates counts per inventory item id', () => {
    const map = packagingCountsByItemId([
      { itemId: 10, count: 100 },
      { itemId: 10, count: 50 },
      { itemId: 11, count: 12 },
      { itemId: null, count: 99 },
    ]);
    expect(map.get(10)).toBe(150);
    expect(map.get(11)).toBe(12);
    expect(map.has(99)).toBe(false);
  });

  it('builds positive and negative deltas by item id', () => {
    const prev = new Map<number, number>([[1, 100], [2, 50]]);
    const next = new Map<number, number>([[1, 80], [3, 10]]);
    const adj = packagingInventoryAdjustmentsById(prev, next);
    expect(adj.get(1)).toBe(20);
    expect(adj.get(2)).toBe(50);
    expect(adj.get(3)).toBe(-10);
  });
});
