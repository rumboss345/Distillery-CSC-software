/** US gallon → litre (exact definition used for CSC migrations). */
export const US_GAL_TO_LITRES = 3.785411784;

/** Convert stored litres to US gallons for display. */
export function litresToUsGallons(litres: number): number {
  return litres / US_GAL_TO_LITRES;
}

/** Convert US gallons to litres for storage. */
export function usGallonsToLitres(gallons: number): number {
  return gallons * US_GAL_TO_LITRES;
}

/**
 * ABV convention: stored as percentage 0–100 (e.g. 40 = 40% ABV).
 * LPA (litres pure alcohol) = volume_litres × (abv / 100).
 */
export function litresPureAlcohol(volumeLitres: number, abvPercent: number): number {
  return volumeLitres * (abvPercent / 100);
}

export type DisplayVolumeUnit = 'L' | 'US_gal';

export function formatVolume(litres: number, unit: DisplayVolumeUnit, digits = 1): string {
  if (unit === 'US_gal') {
    return `${litresToUsGallons(litres).toFixed(digits)} US gal`;
  }
  return `${litres.toFixed(digits)} L`;
}
