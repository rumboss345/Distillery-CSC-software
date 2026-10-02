import { describe, expect, it } from 'vitest';
import { toLbs } from './blending';
import { inventoryQuantityDelta } from './inventory-units';

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
