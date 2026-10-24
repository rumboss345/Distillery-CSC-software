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
} from './inventory-units';

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
