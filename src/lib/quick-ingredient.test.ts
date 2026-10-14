import { describe, expect, it } from 'vitest';
import { inventoryNameExists, preparedIngredientName } from './quick-ingredient';

describe('preparedIngredientName', () => {
  it('keeps the name the user typed, without surrounding spaces', () => {
    expect(preparedIngredientName('  Panela  ')).toBe('Panela');
  });

  it('rejects a blank name', () => {
    expect(() => preparedIngredientName('   ')).toThrow(/ingredient name/i);
  });
});

describe('inventoryNameExists', () => {
  const names = ['Raw Cane Sugar', 'Distillers Yeast DADY'];

  it('matches an existing ingredient ignoring case', () => {
    expect(inventoryNameExists(names, ' raw cane sugar ')).toBe(true);
  });

  it('does not treat a new name as a duplicate', () => {
    expect(inventoryNameExists(names, 'Panela')).toBe(false);
    expect(inventoryNameExists(names, '  ')).toBe(false);
  });
});
