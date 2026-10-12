import { describe, expect, it } from 'vitest';
import {
  activeGinBotanicals,
  botanicalsFromRecipe,
  formatGinBotanicalLine,
  formatGinBotanicalsSummary,
  ginBotanicalPlaceError,
  normalizeBotanicalPlace,
} from './gin-botanicals';

describe('gin botanicals', () => {
  it('keeps a botanical that has a weight', () => {
    const lines = activeGinBotanicals([
      { name: 'Juniper', amount: 2, weight: 500, weight_unit: 'g' },
      { name: 'Coriander', amount: 4, weight: 1.5, weight_unit: 'lbs' },
      { name: 'Empty', amount: 3, weight: 0, weight_unit: 'g' },
    ]);
    expect(lines).toEqual([
      { name: 'Juniper', amount: 0, weight: 500, weight_unit: 'g', place: null },
      { name: 'Coriander', amount: 0, weight: 1.5, weight_unit: 'lbs', place: null },
    ]);
  });

  it('formats the weight as the amount, and copies a saved recipe', () => {
    expect(formatGinBotanicalLine({ name: 'Juniper', amount: 2, weight: 500, weight_unit: 'g', place: 'pot' }))
      .toBe('Juniper · 500 grams · in the pot');
    expect(formatGinBotanicalsSummary([
      { name: 'Juniper', amount: 2, weight: 500, weight_unit: 'g', place: 'basket' },
    ])).toContain('in the basket');
    expect(botanicalsFromRecipe([
      { name: 'Orris', amount: 1, weight: 20, weight_unit: 'g', place: 'basket' },
    ])).toEqual([
      { name: 'Orris', amount: 0, weight: 20, weight_unit: 'g', place: 'basket' },
    ]);
  });

  it('asks for pot or basket before a botanical can be saved', () => {
    expect(normalizeBotanicalPlace(' Basket ')).toBe('basket');
    expect(normalizeBotanicalPlace('still')).toBeNull();
    const lines = [{ name: 'Juniper', amount: 0, weight: 500, weight_unit: 'g', place: null }];
    expect(ginBotanicalPlaceError(lines)).toBe('Choose whether Juniper will go in the pot or in the basket.');
    expect(ginBotanicalPlaceError([{ ...lines[0], place: 'pot' }])).toBeNull();
  });
});
