import { describe, expect, it } from 'vitest';
import {
  activeGinBotanicals,
  botanicalsFromRecipe,
  formatGinBotanicalLine,
  formatGinBotanicalsSummary,
} from './gin-botanicals';

describe('gin botanicals', () => {
  it('keeps a botanical that has an amount or a weight', () => {
    const lines = activeGinBotanicals([
      { name: 'Juniper', amount: 2, weight: 500, weight_unit: 'g' },
      { name: 'Coriander', amount: 0, weight: 1.5, weight_unit: 'lbs' },
      { name: 'Empty', amount: 0, weight: 0, weight_unit: 'g' },
    ]);
    expect(lines).toEqual([
      { name: 'Juniper', amount: 2, weight: 500, weight_unit: 'g' },
      { name: 'Coriander', amount: 0, weight: 1.5, weight_unit: 'lbs' },
    ]);
  });

  it('formats amount and weight, and copies a saved recipe', () => {
    expect(formatGinBotanicalLine({ name: 'Juniper', amount: 2, weight: 500, weight_unit: 'g' }))
      .toBe('Juniper · amount 2 · 500 grams');
    expect(formatGinBotanicalsSummary([
      { name: 'Juniper', amount: 2, weight: 500, weight_unit: 'g' },
    ])).toContain('Juniper');
    expect(botanicalsFromRecipe([
      { name: 'Orris', amount: 1, weight: 20, weight_unit: 'g' },
    ])).toEqual([
      { name: 'Orris', amount: 1, weight: 20, weight_unit: 'g' },
    ]);
  });
});
