import { describe, expect, it } from 'vitest';
import { matchInventoryItemInList, normalizeInventoryNameKey } from './inventory-item-match';

describe('inventory item name match', () => {
  it('matches common botanical spelling differences', () => {
    const items = [{ name: 'Cardamom' }, { name: 'Juniper berries' }];
    expect(normalizeInventoryNameKey('Cardamon')).toBe('cardamon');
    expect(matchInventoryItemInList(items, 'Cardamon')?.name).toBe('Cardamom');
  });

  it('does not guess when two items are equally close', () => {
    const items = [{ name: 'Catnip' }, { name: 'Batnip' }];
    expect(matchInventoryItemInList(items, 'Atnip')).toBeUndefined();
  });
});
