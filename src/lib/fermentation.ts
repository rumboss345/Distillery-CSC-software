import { isIsoDate } from './date-input';
import { GRAMS_PER_POUND, LITERS_PER_US_GALLON, SUCROSE_APPARENT_SPECIFIC_VOLUME_ML_PER_G } from './material-densities';

/** Moving a wash into fermenting requires the measured start Brix. */
export function washMoveNeedsActualStartBrix(
  status: string,
  actualBrix: number | null | undefined,
): boolean {
  if (status === 'planned' || status === 'mashing') return true;
  return actualBrix == null;
}

/** Expected completion must be a real date on or after the fermentation starts. */
export function expectedCompletionDateError(value: string | null | undefined, startDate: string): string | null {
  const date = value?.trim() ?? '';
  if (!isIsoDate(date)) return 'Enter the expected completion date.';
  if (startDate && date < startDate) {
    return 'Expected completion must be on or after the day fermentation starts.';
  }
  return null;
}

export function actualStartBrixError(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return 'Enter the actual start Brix.';
  }
  return null;
}

/** Fermentations must reach this Brix before charging a fermenter to the still. */
export const FERMENTATION_READY_MAX_BRIX = 10;

/** Floor / process view: green liquid below this Brix (logs or starting gravity). */
export const FERMENTER_LIQUID_GREEN_BELOW_BRIX = 6;

export function isBrixReadyForDistillation(brix: number | null | undefined): boolean {
  return brix != null && brix < FERMENTATION_READY_MAX_BRIX;
}

export type FermenterLiquidBrixPhase = 'high' | 'ready' | 'unknown';

/** High-sugar (red) vs ready-to-distill (green) fermenter fill from latest Brix reading. */
export function fermenterLiquidBrixPhase(brix: number | null | undefined): FermenterLiquidBrixPhase {
  if (brix == null || Number.isNaN(brix)) return 'unknown';
  if (brix < FERMENTER_LIQUID_GREEN_BELOW_BRIX) return 'ready';
  return 'high';
}

/** Convert Brix (Balling) to specific gravity. */
export function brixToSg(brix: number): number {
  return 1 + brix / (258.6 - (brix / 258.2) * 227.1);
}

/**
 * Estimate ABV from starting and current Brix using SG conversion
 * and the standard (OG − FG) × 131.25 formula.
 */
export function estimateAbvFromBrix(startBrix: number, currentBrix: number): number | null {
  if (!Number.isFinite(startBrix) || !Number.isFinite(currentBrix)) return null;
  if (startBrix <= 0) return null;
  const og = brixToSg(startBrix);
  const fg = brixToSg(currentBrix);
  const abv = (og - fg) * 131.25;
  if (!Number.isFinite(abv)) return null;
  return Math.round(abv * 10) / 10;
}

export function formatAbvEstimate(abv: number | null): string {
  if (abv == null) return '—';
  return `${abv.toFixed(1)}%`;
}

const LBS_PER_KG = 1000 / GRAMS_PER_POUND;
const LITERS_PER_US_GAL = LITERS_PER_US_GALLON;
/** Liters occupied by 1 kg dissolved sucrose (0.6219 ml/g). */
const SUGAR_DISPLACEMENT_L_PER_KG = SUCROSE_APPARENT_SPECIFIC_VOLUME_ML_PER_G;
/** Homedistiller / Essential Distilling SG factor: 1 + (kg sugar / L) × 0.386 */
const SUGAR_WASH_SG_FACTOR = 0.386;
/** Classic wash ABV divisor: ((SG − 1) × 1000) / 7.46 */
const SUGAR_WASH_ABV_DIVISOR = 7.46;

/** Convert specific gravity to Brix (ASBC polynomial). */
export function sgToBrix(sg: number): number {
  if (!Number.isFinite(sg) || sg <= 1) return 0;
  const brix = ((182.4601 * sg - 775.6821) * sg + 1262.7794) * sg - 669.5622;
  return Math.round(brix * 10) / 10;
}

export interface SugarWashEstimate {
  sg: number;
  brix: number;
  waterGal: number;
  potentialAbv: number;
}

/**
 * Sugar wash estimate matching Essential Distilling:
 * sugar made up to a total volume → SG, water required, potential ABV, Brix.
 */
export function estimateSugarWash(sugarLbs: number, totalVolumeGal: number): SugarWashEstimate | null {
  if (!(sugarLbs > 0) || !(totalVolumeGal > 0)) return null;
  const sugarKg = sugarLbs / LBS_PER_KG;
  const totalL = totalVolumeGal * LITERS_PER_US_GAL;
  const sg = 1 + (sugarKg / totalL) * SUGAR_WASH_SG_FACTOR;
  const waterL = totalL - sugarKg * SUGAR_DISPLACEMENT_L_PER_KG;
  const potentialAbv = ((sg - 1) * 1000) / SUGAR_WASH_ABV_DIVISOR;
  if (!Number.isFinite(sg) || sg <= 1) return null;
  return {
    sg: Math.round(sg * 1000) / 1000,
    brix: sgToBrix(sg),
    waterGal: Math.round(Math.max(0, waterL / LITERS_PER_US_GAL) * 10) / 10,
    potentialAbv: Math.round(potentialAbv * 10) / 10,
  };
}
