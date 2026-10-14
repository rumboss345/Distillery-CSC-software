import { describe, expect, it } from 'vitest';
import {
  ADD_NEW_INGREDIENT_VALUE,
  addNewIngredientLabel,
  inventoryNameExists,
  isAddNewIngredientChoice,
  preparedIngredientName,
} from './quick-ingredient';

describe('add new ingredient menu choice', () => {
  it('labels the menu choice with the ingredient kind', () => {
    expect(addNewIngredientLabel('sugar')).toBe('Add new sugar…');
    expect(addNewIngredientLabel('  ')).toBe('Add new ingredient…');
  });

  it('recognizes only the add-new sentinel', () => {
    expect(isAddNewIngredientChoice(ADD_NEW_INGREDIENT_VALUE)).toBe(true);
    expect(isAddNewIngredientChoice('Panela')).toBe(false);
    expect(isAddNewIngredientChoice('')).toBe(false);
  });
});

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
