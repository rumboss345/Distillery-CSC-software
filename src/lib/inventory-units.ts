import { isVolumeUnit, isWeightUnit, toGallonsFromVolumeUnit, toLbs } from './blending';

function canonicalUnit(unit: string): string {
  const value = unit.trim().toLowerCase();
  if (value === 'lb' || value === 'pound' || value === 'pounds') return 'lbs';
  if (value === 'liter' || value === 'litre' || value === 'liters' || value === 'litres') return 'l';
  if (value === 'gallon' || value === 'gallons') return 'gal';
  if (value === 'floz') return 'fl oz';
  return value;
}

/**
 * Convert a blend amount into the inventory item's unit.
 * Weight converts through pounds and volume through gallons.
 * Returns null when the units are different kinds (weight vs volume) so stock is not deducted by the raw number.
 */
export function inventoryQuantityDelta(
  amount: number,
  amountUnit: string,
  inventoryUnit: string,
): number | null {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const from = canonicalUnit(amountUnit);
  const to = canonicalUnit(inventoryUnit);
  if (!from || !to) return null;
  if (from === to) return amount;

  if (isWeightUnit(from) && isWeightUnit(to)) {
    const lbs = toLbs(amount, from);
    const one = toLbs(1, to);
    if (lbs <= 0 || one <= 0) return null;
    return lbs / one;
  }

  if (isVolumeUnit(from) && isVolumeUnit(to) && from !== 'each' && to !== 'each') {
    const gallons = toGallonsFromVolumeUnit(amount, from);
    const one = toGallonsFromVolumeUnit(1, to);
    if (gallons <= 0 || one <= 0) return null;
    return gallons / one;
  }

  return null;
}
