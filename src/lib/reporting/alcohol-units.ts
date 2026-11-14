import { LITERS_PER_US_GALLON } from '../../services/spirit-gauging';

export { LITERS_PER_US_GALLON };

/** Imperial gallon in liters (UK Weights and Measures Act 1985). Display only; records stay in US gallons. */
export const LITERS_PER_IMPERIAL_GALLON = 4.54609;

/**
 * Volume units a person can pick for display.
 * Every stored volume is US wine gallons (231 in³); other units are converted on screen only.
 */
export type DisplayVolumeUnit = 'us_gal' | 'imp_gal' | 'l';

export const DISPLAY_VOLUME_UNITS: { id: DisplayVolumeUnit; label: string; short: string }[] = [
  { id: 'us_gal', label: 'US gallons', short: 'US gal' },
  { id: 'imp_gal', label: 'Imperial gallons', short: 'imp gal' },
  { id: 'l', label: 'Litres', short: 'L' },
];

export function isDisplayVolumeUnit(value: unknown): value is DisplayVolumeUnit {
  return value === 'us_gal' || value === 'imp_gal' || value === 'l';
}

export function litersFromUsGal(usGal: number): number {
  return usGal * LITERS_PER_US_GALLON;
}

export function usGalFromLiters(liters: number): number {
  return liters / LITERS_PER_US_GALLON;
}

export function imperialGalFromUsGal(usGal: number): number {
  return litersFromUsGal(usGal) / LITERS_PER_IMPERIAL_GALLON;
}

/** Convert a stored US-gallon figure into the display unit. */
export function volumeInUnit(usGal: number, unit: DisplayVolumeUnit): number {
  if (unit === 'l') return litersFromUsGal(usGal);
  if (unit === 'imp_gal') return imperialGalFromUsGal(usGal);
  return usGal;
}

export function displayUnitShort(unit: DisplayVolumeUnit): string {
  return DISPLAY_VOLUME_UNITS.find((row) => row.id === unit)?.short ?? 'US gal';
}

function formatNumber(value: number, decimals: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Liquid volume, e.g. "120.5 US gal" or "456.1 L". Liters use no more than one decimal. */
export function formatVolumeInUnit(usGal: number, unit: DisplayVolumeUnit, decimals = 1): string {
  return `${formatNumber(volumeInUnit(usGal, unit), decimals)} ${displayUnitShort(unit)}`;
}

/**
 * Pure alcohol, from gallons of pure alcohol (US).
 * Liters of pure alcohol (LPA/LAA) is always shown as "L pure alcohol" so it is not read as liquid volume.
 */
export function formatPureAlcoholInUnit(laaUsGal: number, unit: DisplayVolumeUnit, decimals = 2): string {
  return `${formatNumber(volumeInUnit(laaUsGal, unit), decimals)} ${displayUnitShort(unit)} pure alcohol`;
}

/** Gallons of pure alcohol (same as GPA in existing reports). */
export function laaGalFromVolumeAbv(volumeGal: number, abv: number): number {
  if (volumeGal <= 0 || abv <= 0) return 0;
  return roundAlcohol(volumeGal * (abv / 100));
}

export function laaLitersFromVolumeAbv(volumeGal: number, abv: number): number {
  const gal = laaGalFromVolumeAbv(volumeGal, abv);
  if (gal <= 0) return 0;
  return roundAlcohol(gal * LITERS_PER_US_GALLON);
}

export function volumeGalFromLaaGal(laaGal: number, abv: number): number {
  if (laaGal <= 0 || abv <= 0) return 0;
  return roundVolume(laaGal / (abv / 100));
}

export function roundAlcohol(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function roundVolume(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function roundAbv(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function safePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/** Liquid volume (liters) that holds the given LAA at a target ABV. */
export function volumeLitersAtTargetAbv(laaLiters: number, targetAbv: number): number {
  if (!(laaLiters > 0) || !(targetAbv > 0)) return 0;
  return laaLiters / (targetAbv / 100);
}
