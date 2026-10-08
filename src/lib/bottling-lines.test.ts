import { describe, expect, it } from 'vitest';
import {
  additionalPackagingNeeded,
  bottlingReturnError,
  bottlingVolumeVarianceGal,
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

  it('counts bottled gallons and gallons sent to a tank against the source', () => {
    expect(bottlingVolumeVarianceGal(25, 10, 15)).toBeCloseTo(0, 5);
    expect(bottlingVolumeVarianceGal(25, 10, 5)).toBeCloseTo(-10, 5);
    expect(bottlingVolumeVarianceGal(25, 10, 0)).toBeCloseTo(-15, 5);
    expect(bottlingVolumeVarianceGal(25, 30, 0)).toBeCloseTo(5, 5);
    expect(bottlingVolumeVarianceGal(25, 10, -1)).toBeCloseTo(-15, 5);
  });

  it('rejects a return that does not fit the leftover or the destination', () => {
    expect(bottlingReturnError({
      returnGal: 0,
      unbottledGal: 15,
      destTankId: null,
      sourceTankId: 1,
    })).toBeNull();
    expect(bottlingReturnError({
      returnGal: 0,
      unbottledGal: 15,
      destTankId: 2,
      sourceTankId: 1,
    })).toMatch(/how many gallons/);
    expect(bottlingReturnError({
      returnGal: 15,
      unbottledGal: 15,
      destTankId: null,
      sourceTankId: 1,
    })).toMatch(/Choose the tank/);
    expect(bottlingReturnError({
      returnGal: 15,
      unbottledGal: 15,
      destTankId: 1,
      sourceTankId: 1,
    })).toMatch(/different tank/);
    expect(bottlingReturnError({
      returnGal: 16,
      unbottledGal: 15,
      destTankId: 2,
      sourceTankId: 1,
    })).toMatch(/Only 15\.00 gal/);
    expect(bottlingReturnError({
      returnGal: 10,
      unbottledGal: 15,
      destTankId: 2,
      sourceTankId: 1,
      destName: 'Latina 2',
      destVolumeGal: 95,
      destCapacityGal: 100,
    })).toMatch(/5\.0 gal of room/);
    expect(bottlingReturnError({
      returnGal: 5,
      unbottledGal: 15,
      destTankId: 2,
      sourceTankId: 1,
      destName: 'Latina 2',
      destVolumeGal: 90,
      destCapacityGal: 100,
    })).toBeNull();
  });

  it('formats line summary', () => {
    expect(formatLinesSummary([
      { packaging_bottle: '750mL 7F', bottle_count: 120, bottle_size_ml: 750 },
      { packaging_bottle: '375mL Oslo', bottle_count: 48, bottle_size_ml: 375 },
    ])).toBe('750mL 7F × 120, 375mL Oslo × 48');
  });
});
