import { spiritLbsPerGallon } from './blending';
import {
  formatGallonDisplay,
  formatQuantityDisplay,
} from './formulation-quantity';
import {
  GRAMS_PER_POUND,
  LITERS_PER_US_GALLON,
  ML_PER_LITER,
  ML_PER_US_GALLON,
} from './material-densities';

/** Continuous formulation pounds for a wine-gallon spirit volume. Not a Table 3 proof-gallon gauge. */
export function formulationSpiritWeightLb(volumeGal: number, abv: number): number {
  if (!(volumeGal > 0) || !(abv > 0)) return 0;
  return volumeGal * spiritLbsPerGallon(abv);
}

/** Continuous formulation gallons for a spirit weight. Not Table 3 0.1 proof-gallon rounding. */
export function formulationSpiritVolumeGal(weightLb: number, abv: number): number {
  if (!(weightLb > 0) || !(abv > 0)) return 0;
  const perGallon = spiritLbsPerGallon(abv);
  if (!(perGallon > 0)) return 0;
  return weightLb / perGallon;
}

export interface SpiritChargeQuantities {
  gallons: number;
  pounds: number;
  grams: number;
  liters: number;
  milliliters: number;
}

/** Every unit describes the same spirit gallons. */
export function spiritChargeQuantities(volumeGal: number, abv: number): SpiritChargeQuantities {
  const pounds = formulationSpiritWeightLb(volumeGal, abv);
  const liters = volumeGal * LITERS_PER_US_GALLON;
  return {
    gallons: volumeGal,
    pounds,
    grams: pounds * GRAMS_PER_POUND,
    liters,
    milliliters: liters * ML_PER_LITER,
  };
}

export interface DisplayedSpiritCharge {
  gallons: string;
  pounds: string;
  grams: string;
  liters: string;
  milliliters: string;
}

export function formatSpiritCharge(volumeGal: number, abv: number): DisplayedSpiritCharge {
  const charge = spiritChargeQuantities(volumeGal, abv);
  return {
    gallons: formatGallonDisplay(charge.gallons),
    pounds: formatQuantityDisplay(charge.pounds, 3),
    grams: formatQuantityDisplay(charge.grams, 3),
    liters: formatQuantityDisplay(charge.liters, 3),
    milliliters: formatQuantityDisplay(charge.milliliters, 3),
  };
}

function parsedGallonsFromDisplay(text: string, unit: keyof DisplayedSpiritCharge, abv: number): number {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return Number.NaN;
  switch (unit) {
    case 'gallons':
      return value;
    case 'liters':
      return value / LITERS_PER_US_GALLON;
    case 'milliliters':
      return value / ML_PER_US_GALLON;
    case 'pounds':
      return formulationSpiritVolumeGal(value, abv);
    case 'grams':
      return formulationSpiritVolumeGal(value / GRAMS_PER_POUND, abv);
    default:
      return Number.NaN;
  }
}

/**
 * True when the displayed pounds, grams, mL, liters, and gallons are one charge.
 * Display rounding may move the last shown digit. It must not describe a different charge.
 */
export function displayedSpiritChargeAgrees(volumeGal: number, abv: number): boolean {
  const shown = formatSpiritCharge(volumeGal, abv);
  const gallonText = parsedGallonsFromDisplay(shown.gallons, 'gallons', abv);
  const tolerance = Math.max(0.0005, Math.abs(volumeGal) * 0.002);
  return (Object.keys(shown) as (keyof DisplayedSpiritCharge)[]).every((unit) => {
    const gallons = parsedGallonsFromDisplay(shown[unit], unit, abv);
    return Math.abs(gallons - gallonText) <= tolerance;
  });
}

/** True only when the printed pounds and gallons are the same spirit charge at this ABV. */
export function spiritDisplaysDescribeSameCharge(pounds: number, gallons: number, abv: number): boolean {
  const fromPounds = formulationSpiritVolumeGal(pounds, abv);
  return Math.abs(fromPounds - gallons) <= Math.max(0.0005, Math.abs(gallons) * 0.002);
}
