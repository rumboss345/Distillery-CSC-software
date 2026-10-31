import { describe, expect, it } from 'vitest';
import { toLbs } from './blending';
import {
  defaultInventoryUnit,
  defaultInventoryUnitForCategory,
  inventoryCategoryLabel,
  inventoryQuantityDelta,
  inventoryUnitForKind,
  inventoryUnitKind,
  inventoryUnitsForKind,
  convertInventoryAdjustment,
  defaultAdjustmentUnit,
  inventoryAdjustmentUnits,
} from './inventory-units';

describe('inventory adjustments in a larger unit', () => {
  it('converts a delivery in kg or tons into the item unit', () => {
    expect(convertInventoryAdjustment(25, 'kg', 'g')).toBeCloseTo(25000, 6);
    expect(convertInventoryAdjustment(1, 'ton', 'lbs')).toBeCloseTo(2000, 6);
    expect(convertInventoryAdjustment(1, 'tonne', 'kg')).toBeCloseTo(1000, 6);
    expect(convertInventoryAdjustment(2, 'lbs', 'oz')).toBeCloseTo(32, 6);
  });

  it('converts a delivery in gallons, drums, or totes into the item unit', () => {
    expect(convertInventoryAdjustment(1, 'gal', 'l')).toBeCloseTo(3.785411784, 6);
    expect(convertInventoryAdjustment(1, 'drum', 'gal')).toBeCloseTo(55, 6);
    expect(convertInventoryAdjustment(1, 'tote', 'l')).toBeCloseTo(275 * 3.785411784, 4);
    expect(convertInventoryAdjustment(2, 'l', 'ml')).toBeCloseTo(2000, 6);
  });

  it('saves whole conversions exactly, without floating-point tails', () => {
    expect(100 + convertInventoryAdjustment(2, 'kg', 'g')!).toBe(2100);
    expect(2100 + convertInventoryAdjustment(-0.5, 'kg', 'g')!).toBe(1600);
  });

  it('keeps the sign so stock can be removed in a larger unit', () => {
    expect(convertInventoryAdjustment(-1.5, 'kg', 'g')).toBeCloseTo(-1500, 6);
  });

  it('accepts older unit spellings on the item', () => {
    expect(convertInventoryAdjustment(1, 'kg', 'pounds')).toBeCloseTo(2.20462262185, 6);
    expect(defaultAdjustmentUnit('Liters')).toBe('l');
  });

  it('refuses to mix mass and volume', () => {
    expect(convertInventoryAdjustment(1, 'kg', 'gal')).toBeNull();
  });

  it('lists same-kind units, and only the own unit for count items', () => {
    expect(inventoryAdjustmentUnits('g').map((u) => u.value)).toEqual(['g', 'oz', 'lbs', 'kg', 'ton', 'tonne']);
    expect(inventoryAdjustmentUnits('ml').map((u) => u.value)).toContain('tote');
    expect(inventoryAdjustmentUnits('each').map((u) => u.value)).toEqual(['each']);
  });
});

describe('inventory unit conversion', () => {
  it('converts kilograms into pounds before a deduction', () => {
    expect(inventoryQuantityDelta(1, 'kg', 'lbs')).toBeCloseTo(toLbs(1, 'kg'), 5);
  });

  it('converts liters into gallons', () => {
    const gallons = inventoryQuantityDelta(1, 'L', 'gal');
    expect(gallons).toBeGreaterThan(0.26);
    expect(gallons).toBeLessThan(0.27);
  });

  it('leaves matching units unchanged', () => {
    expect(inventoryQuantityDelta(4, 'lbs', 'lb')).toBe(4);
  });

  it('does not convert weight into volume', () => {
    expect(inventoryQuantityDelta(10, 'lbs', 'gal')).toBeNull();
  });
});

describe('inventory unit kinds', () => {
  it('groups units into volume, mass, and each', () => {
    expect(inventoryUnitKind('gal')).toBe('volume');
    expect(inventoryUnitKind('L')).toBe('volume');
    expect(inventoryUnitKind('lbs')).toBe('mass');
    expect(inventoryUnitKind('kg')).toBe('mass');
    expect(inventoryUnitKind('each')).toBe('each');
    expect(inventoryUnitKind('bag')).toBe('each');
    expect(inventoryUnitKind('sacks')).toBe('each');
  });

  it('lists units for the chosen kind and keeps a custom count unit', () => {
    expect(inventoryUnitsForKind('volume').map((unit) => unit.value)).toEqual(['gal', 'l', 'ml', 'fl oz']);
    expect(inventoryUnitsForKind('mass').map((unit) => unit.value)).toEqual(['lbs', 'oz', 'kg', 'g']);
    expect(inventoryUnitsForKind('each', 'sacks').map((unit) => unit.value)).toContain('sacks');
    expect(inventoryUnitForKind('volume', 'lbs')).toBe('gal');
    expect(inventoryUnitForKind('mass', 'kg')).toBe('kg');
    expect(defaultInventoryUnit('each')).toBe('each');
    expect(defaultInventoryUnitForCategory('packaging')).toBe('each');
    expect(defaultInventoryUnitForCategory('sugar')).toBe('lbs');
  });
});

describe('inventoryCategoryLabel', () => {
  it('capitalizes each word of a stored category', () => {
    expect(inventoryCategoryLabel('botanicals')).toBe('Botanicals');
    expect(inventoryCategoryLabel('raw sugar')).toBe('Raw Sugar');
    expect(inventoryCategoryLabel('  yeast ')).toBe('Yeast');
  });
});
