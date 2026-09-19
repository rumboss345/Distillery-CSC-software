import { LITERS_PER_US_GALLON } from '../../services/spirit-gauging';

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
