import Decimal from 'decimal.js';

/**
 * All alcohol, volume, mass, density, proofing, costing, and inventory
 * arithmetic in this engine goes through decimal.js. Results that are stored
 * are rounded with the rules in ROUNDING and returned as strings.
 *
 * 27 CFR §30.66: "In rounding off where the decimal is less than five, it will
 * be dropped; if it is five or over a unit will be added." That is half away
 * from zero for the positive quantities this engine stores.
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function dec(value: Decimal.Value): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Engine values must be finite decimal strings, not binary floats.');
    }
    throw new Error('Pass decimal strings into the engine. Binary floats are not accepted.');
  }
  const text = String(value).trim();
  if (text === '' || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    throw new Error(`Not a decimal value: ${value}`);
  }
  return new Decimal(text);
}

export function isDecimalString(value: string): boolean {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim());
}

/** Half-up to a fixed number of places, always including trailing zeros. */
export function roundFixed(value: Decimal.Value, places: number): string {
  return dec(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
}

export type SnapshotValue = string | null;

/**
 * Immutable calculation record. Every numeric field is already a rounded
 * decimal string. The JSON text is what a later snapshot stores.
 */
export function snapshotJson(fields: Record<string, SnapshotValue>): string {
  const keys = Object.keys(fields).sort();
  const ordered: Record<string, SnapshotValue> = {};
  for (const key of keys) {
    const value = fields[key];
    if (value !== null && typeof value !== 'string') {
      throw new Error(`Snapshot field ${key} must be a decimal string or null.`);
    }
    ordered[key] = value;
  }
  return JSON.stringify(ordered);
}
