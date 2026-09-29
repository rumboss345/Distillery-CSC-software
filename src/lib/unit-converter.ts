import { LB_PER_KG, LITERS_PER_US_GALLON } from '../services/spirit-gauging';

/** US fluid ounces in one US gallon. */
export const US_FL_OZ_PER_GALLON = 128;
/** Avoirdupois ounces in one pound. */
export const OZ_PER_LB = 16;

export type VolumeUnitId = 'gal' | 'l' | 'ml' | 'floz';
export type WeightUnitId = 'lb' | 'oz' | 'kg' | 'g';

export const VOLUME_UNITS: { id: VolumeUnitId; label: string; short: string }[] = [
  { id: 'gal', label: 'US gallons', short: 'US gal' },
  { id: 'l', label: 'Liters', short: 'L' },
  { id: 'ml', label: 'Milliliters', short: 'mL' },
  { id: 'floz', label: 'US fluid ounces', short: 'fl oz' },
];

export const WEIGHT_UNITS: { id: WeightUnitId; label: string; short: string }[] = [
  { id: 'lb', label: 'Pounds', short: 'lb' },
  { id: 'oz', label: 'Ounces', short: 'oz' },
  { id: 'kg', label: 'Kilograms', short: 'kg' },
  { id: 'g', label: 'Grams', short: 'g' },
];

const LITERS_PER_VOLUME_UNIT: Record<VolumeUnitId, number> = {
  gal: LITERS_PER_US_GALLON,
  l: 1,
  ml: 0.001,
  floz: LITERS_PER_US_GALLON / US_FL_OZ_PER_GALLON,
};

const GRAMS_PER_WEIGHT_UNIT: Record<WeightUnitId, number> = {
  kg: 1000,
  g: 1,
  lb: 1000 / LB_PER_KG,
  oz: 1000 / LB_PER_KG / OZ_PER_LB,
};

function finiteAmount(amount: number): number | null {
  if (!Number.isFinite(amount)) return null;
  return amount;
}

/** Convert a volume into US gallons, liters, milliliters, and US fluid ounces. */
export function convertVolume(
  amount: number,
  from: VolumeUnitId,
): Record<VolumeUnitId, number> | null {
  const value = finiteAmount(amount);
  if (value == null) return null;
  const liters = value * LITERS_PER_VOLUME_UNIT[from];
  return {
    gal: liters / LITERS_PER_VOLUME_UNIT.gal,
    l: liters / LITERS_PER_VOLUME_UNIT.l,
    ml: liters / LITERS_PER_VOLUME_UNIT.ml,
    floz: liters / LITERS_PER_VOLUME_UNIT.floz,
  };
}

/** Convert a weight into pounds, ounces, kilograms, and grams. */
export function convertWeight(
  amount: number,
  from: WeightUnitId,
): Record<WeightUnitId, number> | null {
  const value = finiteAmount(amount);
  if (value == null) return null;
  const grams = value * GRAMS_PER_WEIGHT_UNIT[from];
  return {
    lb: grams / GRAMS_PER_WEIGHT_UNIT.lb,
    oz: grams / GRAMS_PER_WEIGHT_UNIT.oz,
    kg: grams / GRAMS_PER_WEIGHT_UNIT.kg,
    g: grams / GRAMS_PER_WEIGHT_UNIT.g,
  };
}

export function formatConvertedAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (abs >= 100) return value.toFixed(2);
  if (abs >= 1) return value.toFixed(3);
  if (abs === 0) return '0';
  return value.toFixed(4);
}
