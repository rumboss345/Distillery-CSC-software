import { isVolumeUnit, isWeightUnit, toGallonsFromVolumeUnit, toLbs } from './blending';

export type InventoryUnitKind = 'volume' | 'mass' | 'each';

export const INVENTORY_UNIT_KINDS: { value: InventoryUnitKind; label: string }[] = [
  { value: 'volume', label: 'Volume' },
  { value: 'mass', label: 'Mass' },
  { value: 'each', label: 'Each' },
];

export const INVENTORY_UNITS_BY_KIND: Record<InventoryUnitKind, { value: string; label: string }[]> = {
  volume: [
    { value: 'gal', label: 'US gal' },
    { value: 'l', label: 'L' },
    { value: 'ml', label: 'mL' },
    { value: 'fl oz', label: 'fl oz' },
  ],
  mass: [
    { value: 'lbs', label: 'lbs' },
    { value: 'oz', label: 'oz' },
    { value: 'kg', label: 'kg' },
    { value: 'g', label: 'g' },
  ],
  each: [
    { value: 'each', label: 'each' },
    { value: 'bag', label: 'bag' },
    { value: 'bottle', label: 'bottle' },
    { value: 'case', label: 'case' },
    { value: 'box', label: 'box' },
  ],
};

const COUNT_UNITS = new Set(INVENTORY_UNITS_BY_KIND.each.map((unit) => unit.value));

function canonicalUnit(unit: string): string {
  const value = unit.trim().toLowerCase();
  if (value === 'lb' || value === 'pound' || value === 'pounds') return 'lbs';
  if (value === 'liter' || value === 'litre' || value === 'liters' || value === 'litres') return 'l';
  if (value === 'gallon' || value === 'gallons') return 'gal';
  if (value === 'floz') return 'fl oz';
  if (value === 'ea') return 'each';
  if (value === 'bags') return 'bag';
  if (value === 'bottles') return 'bottle';
  if (value === 'cases') return 'case';
  if (value === 'boxes') return 'box';
  return value;
}

/** Volume, mass, or count for an inventory unit. */
export function inventoryUnitKind(unit: string): InventoryUnitKind {
  const value = canonicalUnit(unit);
  if (!value) return 'mass';
  if (isWeightUnit(value)) return 'mass';
  if (COUNT_UNITS.has(value)) return 'each';
  if (isVolumeUnit(value) && value !== 'each') return 'volume';
  return 'each';
}

export function defaultInventoryUnit(kind: InventoryUnitKind): string {
  return INVENTORY_UNITS_BY_KIND[kind][0].value;
}

export function defaultInventoryUnitForCategory(category: string): string {
  return category === 'packaging' ? 'each' : defaultInventoryUnit('mass');
}

export function inventoryUnitsForKind(
  kind: InventoryUnitKind,
  currentUnit = '',
): { value: string; label: string }[] {
  const units = INVENTORY_UNITS_BY_KIND[kind];
  const current = currentUnit.trim();
  if (!current) return units;
  const canon = canonicalUnit(current);
  if (units.some((unit) => unit.value === canon || unit.value === current)) return units;
  // Keep a custom count unit (sacks, pails) on Each. Do not carry mass or volume into another kind.
  if (kind === 'each' && inventoryUnitKind(current) === 'each') {
    return [...units, { value: current, label: current }];
  }
  return units;
}

/** Keep the current unit when it belongs to the kind, otherwise the kind's default. */
export function inventoryUnitForKind(kind: InventoryUnitKind, currentUnit: string): string {
  const options = inventoryUnitsForKind(kind, currentUnit);
  const canon = canonicalUnit(currentUnit);
  const match = options.find((unit) => unit.value === canon || unit.value === currentUnit.trim());
  return match?.value ?? defaultInventoryUnit(kind);
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

const LBS_PER_ADJUST_UNIT: Record<string, number> = {
  g: 1 / 453.59237,
  oz: 1 / 16,
  lbs: 1,
  kg: 2.20462262185,
  ton: 2000,
  tonne: 2204.62262185,
};

const GAL_PER_ADJUST_UNIT: Record<string, number> = {
  ml: 1 / 3785.411784,
  'fl oz': 1 / 128,
  l: 1 / 3.785411784,
  gal: 1,
  drum: 55,
  tote: 275,
};

const ADJUST_UNITS_BY_KIND: Record<'volume' | 'mass', { value: string; label: string }[]> = {
  mass: [
    { value: 'g', label: 'g' },
    { value: 'oz', label: 'oz' },
    { value: 'lbs', label: 'lbs' },
    { value: 'kg', label: 'kg' },
    { value: 'ton', label: 'US ton (2,000 lbs)' },
    { value: 'tonne', label: 'Metric ton (1,000 kg)' },
  ],
  volume: [
    { value: 'ml', label: 'mL' },
    { value: 'fl oz', label: 'fl oz' },
    { value: 'l', label: 'L' },
    { value: 'gal', label: 'US gal' },
    { value: 'drum', label: 'Drum (55 gal)' },
    { value: 'tote', label: 'Tote (275 gal)' },
  ],
};

/**
 * Units you can type an adjustment in. Mass and volume items can use any unit of the same kind,
 * including large delivery units. Count items only use their own unit.
 */
export function inventoryAdjustmentUnits(itemUnit: string): { value: string; label: string }[] {
  const kind = inventoryUnitKind(itemUnit);
  const own = canonicalUnit(itemUnit);
  if (kind === 'each') return [{ value: own || itemUnit, label: itemUnit || 'each' }];
  const units = ADJUST_UNITS_BY_KIND[kind];
  return units.some((unit) => unit.value === own)
    ? units
    : [{ value: own || itemUnit, label: itemUnit }, ...units];
}

/** The item's own unit, as it appears in the adjustment unit list. */
export function defaultAdjustmentUnit(itemUnit: string): string {
  return canonicalUnit(itemUnit) || itemUnit;
}

/**
 * Convert an adjustment typed in `fromUnit` into the item's own unit. Keeps the sign.
 * Returns null when the units are different kinds.
 */
export function convertInventoryAdjustment(amount: number, fromUnit: string, itemUnit: string): number | null {
  if (!Number.isFinite(amount)) return null;
  const from = canonicalUnit(fromUnit);
  const to = canonicalUnit(itemUnit);
  if (from === to) return amount;
  const table = LBS_PER_ADJUST_UNIT[from] != null && LBS_PER_ADJUST_UNIT[to] != null
    ? LBS_PER_ADJUST_UNIT
    : GAL_PER_ADJUST_UNIT[from] != null && GAL_PER_ADJUST_UNIT[to] != null
      ? GAL_PER_ADJUST_UNIT
      : null;
  if (!table) return null;
  return Math.round(((amount * table[from]) / table[to]) * 1e6) / 1e6;
}

/** Display name for a stored inventory category, e.g. "raw sugar" → "Raw Sugar". */
export function inventoryCategoryLabel(category: string): string {
  return category
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
