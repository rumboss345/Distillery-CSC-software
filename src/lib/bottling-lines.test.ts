import { describe, expect, it } from 'vitest';
import {
  additionalPackagingNeeded,
  formatLinesSummary,
  isRumBottlingProduct,
  lineVolumeGal,
  maxBottlesFromGallons,
  packagingBottleCountsBySku,
  packagingInventoryAdjustments,
  totalVolumeGal,
} from './bottling-lines';

describe('bottling-lines', () => {
  it('detects rum products for bottling UI', () => {
    expect(isRumBottlingProduct('Island Reserve Rum')).toBe(true);
    expect(isRumBottlingProduct('Spiced Rum 750')).toBe(true);
    expect(isRumBottlingProduct('CSC Gin')).toBe(false);
  });

  it('computes line volume from count and size', () => {
    expect(lineVolumeGal({ bottle_count: 100, bottle_size_ml: 750 })).toBeCloseTo(19.81, 1);
  });

  it('sums multiple lines', () => {
    const total = totalVolumeGal([
      { bottle_count: 100, bottle_size_ml: 750 },
      { bottle_count: 48, bottle_size_ml: 375 },
    ]);
    expect(total).toBeCloseTo(24.58, 1);
  });

  it('estimates max bottles from remaining gallons', () => {
    expect(maxBottlesFromGallons(20, 750)).toBe(100);
    expect(maxBottlesFromGallons(20, 375)).toBe(201);
  });

  it('aggregates packaging counts and inventory deltas', () => {
    const prev = packagingBottleCountsBySku([
      { packaging_bottle: '750mL 7F', bottle_count: 100 },
    ]);
    const next = packagingBottleCountsBySku([
      { packaging_bottle: '750mL 7F', bottle_count: 80 },
      { packaging_bottle: '375mL Oslo', bottle_count: 48 },
    ]);
    expect(additionalPackagingNeeded(prev, next)).toEqual({ '375mL Oslo': 48 });
    expect(packagingInventoryAdjustments(prev, next)).toEqual({
      '750mL 7F': 20,
      '375mL Oslo': -48,
    });
  });

  it('formats line summary', () => {
    expect(formatLinesSummary([
      { packaging_bottle: '750mL 7F', bottle_count: 120, bottle_size_ml: 750 },
      { packaging_bottle: '375mL Oslo', bottle_count: 48, bottle_size_ml: 375 },
    ])).toBe('750mL 7F × 120, 375mL Oslo × 48');
  });
});
