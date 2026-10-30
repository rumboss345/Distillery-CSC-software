import { describe, expect, it } from 'vitest';
import {
  additionalPackagingNeeded,
  bottlingReturnError,
  bottlingReturnsError,
  bottlingReturnsTotalGal,
  bottlingAlcoholVarianceGal,
  bottlingVolumeVarianceGal,
  describeBottlingVarianceChange,
  formatBottlingAlcoholVariance,
  reportedBottlingAlcoholVarianceGal,
  reportedBottlingVarianceGal,
  bottleSizeCounts,
  formatBottleSizes,
  formatLinesSummary,
  isRumBottlingProduct,
  bottlingCountsTowardProduction,
  bottlingIsPlanned,
  normalizeBottlingStatus,
  lineVolumeGal,
  maxBottlesFromGallons,
  packagingBottleCountsBySku,
  packagingInventoryAdjustments,
  packagingLabelCountsBySku,
  totalVolumeGal,
} from './bottling-lines';

describe('bottling-lines', () => {
  it('treats a missing bottling status as finished', () => {
    expect(normalizeBottlingStatus(undefined)).toBe('complete');
    expect(normalizeBottlingStatus('running')).toBe('running');
    expect(bottlingIsPlanned('planned')).toBe(true);
    expect(bottlingCountsTowardProduction('planned')).toBe(false);
    expect(bottlingCountsTowardProduction('running')).toBe(true);
    expect(bottlingCountsTowardProduction('complete')).toBe(true);
  });

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

  it('aggregates label counts the same way as bottles', () => {
    expect(packagingLabelCountsBySku([
      { packaging_label: 'Front Labels', bottle_count: 100 },
      { packaging_label: 'Front Labels', bottle_count: 20 },
      { packaging_label: '', bottle_count: 12 },
    ])).toEqual({ 'Front Labels': 120 });
  });

  it('does not treat gallons sent to a tank as a loss', () => {
    expect(reportedBottlingVarianceGal({
      source_volume_gal: 25,
      bottled_volume_gal: 10,
      volume_variance_gal: -15,
      returns: [{ volume_gal: 15 }],
    })).toBeCloseTo(0, 5);
    expect(reportedBottlingVarianceGal({
      source_volume_gal: 25,
      bottled_volume_gal: 10,
      volume_variance_gal: -15,
      return_volume_gal: 5,
    })).toBeCloseTo(-10, 5);
    expect(reportedBottlingVarianceGal({
      source_volume_gal: 25,
      bottled_volume_gal: 10,
      volume_variance_gal: -15,
    })).toBeCloseTo(-15, 5);
  });

  it('counts alcohol gained or lost against the alcohol drawn', () => {
    expect(bottlingAlcoholVarianceGal({
      sourceGal: 100,
      sourceAbv: 40,
      bottledGal: 100,
      bottledAbv: 38,
      returnGal: 0,
    })).toBeCloseTo(-2, 5);
    expect(bottlingAlcoholVarianceGal({
      sourceGal: 25,
      sourceAbv: 40,
      bottledGal: 10,
      bottledAbv: 40,
      returnGal: 15,
    })).toBeCloseTo(0, 5);
    expect(bottlingAlcoholVarianceGal({
      sourceGal: 25,
      sourceAbv: 40,
      bottledGal: 10,
      bottledAbv: 40,
      returnGal: 0,
    })).toBeCloseTo(-6, 5);
    expect(bottlingAlcoholVarianceGal({
      sourceGal: 10,
      sourceAbv: 40,
      bottledGal: 10,
      bottledAbv: 42,
      returnGal: 0,
    })).toBeCloseTo(0.2, 5);
    expect(bottlingAlcoholVarianceGal({
      sourceGal: 25,
      sourceAbv: null,
      bottledGal: 10,
      bottledAbv: 40,
      returnGal: 0,
    })).toBeNull();
    expect(bottlingAlcoholVarianceGal({
      sourceGal: 25,
      sourceAbv: 40,
      bottledGal: 10,
      bottledAbv: 0,
      returnGal: 0,
    })).toBeNull();
    expect(formatBottlingAlcoholVariance(-2)).toBe('Loss 2.00 gal alcohol');
    expect(formatBottlingAlcoholVariance(0.2)).toBe('Gain 0.20 gal alcohol');
    expect(describeBottlingVarianceChange({
      volumeVarianceGal: 0,
      alcoholVarianceGal: -2,
      productName: 'Dark Rum',
    })).toBe('Loss 2.00 gal alcohol (Dark Rum)');
    expect(describeBottlingVarianceChange({
      volumeVarianceGal: -15,
      alcoholVarianceGal: -6,
      productName: 'Dark Rum',
    })).toBe('-15.00 gal vs the tank. Loss 6.00 gal alcohol (Dark Rum)');
    expect(reportedBottlingAlcoholVarianceGal({
      source_volume_gal: 100,
      source_abv: 40,
      bottled_volume_gal: 100,
      final_abv: 38,
      alcohol_variance_gal: 0,
      return_volume_gal: 0,
    })).toBeCloseTo(-2, 5);
    expect(reportedBottlingAlcoholVarianceGal({
      source_volume_gal: 100,
      bottled_volume_gal: 100,
      final_abv: 38,
      alcohol_variance_gal: null,
    })).toBeNull();
    expect(reportedBottlingAlcoholVarianceGal({
      alcohol_variance_gal: -1.5,
    })).toBeCloseTo(-1.5, 5);
  });

  it('counts bottled gallons and gallons sent to a tank against the source', () => {
    expect(bottlingVolumeVarianceGal(25, 10, 15)).toBeCloseTo(0, 5);
    expect(bottlingVolumeVarianceGal(25, 10, 5)).toBeCloseTo(-10, 5);
    expect(bottlingVolumeVarianceGal(25, 10, 0)).toBeCloseTo(-15, 5);
    expect(bottlingVolumeVarianceGal(25, 30, 0)).toBeCloseTo(5, 5);
    expect(bottlingVolumeVarianceGal(25, 10, -1)).toBeCloseTo(-15, 5);
  });

  it('splits leftover gallons across more than one tank', () => {
    expect(bottlingReturnsTotalGal([
      { gallons: 8 },
      { gallons: 7 },
    ])).toBeCloseTo(15, 5);
    expect(bottlingVolumeVarianceGal(25, 10, bottlingReturnsTotalGal([
      { gallons: 8 },
      { gallons: 7 },
    ]))).toBeCloseTo(0, 5);
    expect(bottlingReturnsError({
      returns: [
        { tankId: 2, gallons: 8, name: 'Milk can 1', destVolumeGal: 0, destCapacityGal: 50 },
        { tankId: 3, gallons: 7, name: 'Milk can 2', destVolumeGal: 0, destCapacityGal: 50 },
      ],
      unbottledGal: 15,
      sourceTankId: 1,
    })).toBeNull();
    expect(bottlingReturnsError({
      returns: [
        { tankId: 2, gallons: 10, name: 'Milk can 1' },
        { tankId: 3, gallons: 6, name: 'Milk can 2' },
      ],
      unbottledGal: 15,
      sourceTankId: 1,
    })).toMatch(/Only 15\.00 gal/);
    expect(bottlingReturnsError({
      returns: [
        { tankId: 2, gallons: 8, name: 'Milk can 1' },
        { tankId: 2, gallons: 7, name: 'Milk can 1' },
      ],
      unbottledGal: 15,
      sourceTankId: 1,
    })).toMatch(/already selected/);
    expect(bottlingReturnsError({
      returns: [
        { tankId: 2, gallons: 8, name: 'Milk can 1' },
        { tankId: null, gallons: 2 },
      ],
      unbottledGal: 15,
      sourceTankId: 1,
    })).toMatch(/Choose the tank/);
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
      destName: 'Hearts Tank',
      destVolumeGal: 25,
      destCapacityGal: 25,
    })).toBeNull();
    expect(bottlingReturnsError({
      returns: [
        { tankId: 1, gallons: 15, name: 'Hearts Tank', destVolumeGal: 25, destCapacityGal: 25 },
      ],
      unbottledGal: 15,
      sourceTankId: 1,
    })).toBeNull();
    expect(bottlingReturnsError({
      returns: [
        { tankId: 1, gallons: 10, name: 'Hearts Tank', destVolumeGal: 25, destCapacityGal: 25 },
        { tankId: 2, gallons: 5, name: 'Milk can 1', destVolumeGal: 0, destCapacityGal: 50 },
      ],
      unbottledGal: 15,
      sourceTankId: 1,
    })).toBeNull();
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

  it('groups bottles by size, largest first', () => {
    expect(bottleSizeCounts([
      { bottle_count: 40, bottle_size_ml: 50 },
      { packaging_bottle: '750mL 7F', bottle_count: 100, bottle_size_ml: 750 },
      { packaging_bottle: '750mL Gin', bottle_count: 20, bottle_size_ml: 750 },
      { bottle_count: 0, bottle_size_ml: 200 },
    ])).toEqual([
      { sizeMl: 750, count: 120 },
      { sizeMl: 50, count: 40 },
    ]);
    expect(formatBottleSizes([
      { bottle_count: 100, bottle_size_ml: 750 },
      { bottle_count: 48, bottle_size_ml: 375 },
    ])).toBe('100 × 750 ml, 48 × 375 ml');
    expect(formatBottleSizes([])).toBe('—');
  });

  it('formats line summary', () => {
    expect(formatLinesSummary([
      { packaging_bottle: '750mL 7F', bottle_count: 120, bottle_size_ml: 750 },
      { packaging_bottle: '375mL Oslo', bottle_count: 48, bottle_size_ml: 375 },
    ])).toBe('750mL 7F × 120, 375mL Oslo × 48');
    expect(formatLinesSummary([
      { packaging_bottle: '750mL 7F', packaging_label: 'Front Labels', bottle_count: 120, bottle_size_ml: 750 },
    ])).toBe('750mL 7F + Front Labels × 120');
  });
});
