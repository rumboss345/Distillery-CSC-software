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

/** Days after the wash is transferred into fermenters. */
export const FERMENTATION_EXPECTED_DAYS = 4;

/** Four days after the wash moves into the fermenters, as YYYY-MM-DD. */
export function defaultExpectedCompletionDate(
  transferDate: string | null | undefined,
  days: number = FERMENTATION_EXPECTED_DAYS,
): string {
  const day = transferDate?.trim() ?? '';
  if (!isIsoDate(day)) return '';
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * Keep a date the user already chose. Otherwise use four days after the transfer.
 */
export function expectedCompletionForTransfer(
  transferDate: string | null | undefined,
  existing: string | null | undefined,
): string {
  const saved = existing?.trim() ?? '';
  if (saved) return saved;
  return defaultExpectedCompletionDate(transferDate);
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

/** Note stored on the log created from Actual Start Brix. */
export const ACTUAL_START_BRIX_LOG_NOTE = 'Actual start Brix';

/**
 * Fermenters that are just set to ferment and do not already have a log.
 * Each one gets the Actual Start Brix as its first reading.
 */
export function fermentersForStartBrixLog(
  assignments: readonly { equipmentId: number; status?: string | null }[],
  fermentersWithLogs: ReadonlySet<number>,
): number[] {
  const ids: number[] = [];
  for (const assignment of assignments) {
    if (assignment.status === 'complete' || assignment.status === 'discarded') continue;
    if (!(assignment.equipmentId > 0)) continue;
    if (fermentersWithLogs.has(assignment.equipmentId)) continue;
    ids.push(assignment.equipmentId);
  }
  return ids;
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

/** Hydrometer readings a finished ferment can show, down to a little under 1.000. */
export const FERMENTATION_GRAVITY_MIN = 0.98;
export const FERMENTATION_GRAVITY_MAX = 1.2;
/**
 * Brix a fermentation log or wash target can store.
 * The low end covers a 0.980 hydrometer reading. The high end covers a heavy sugar wash.
 */
export const FERMENTATION_BRIX_MIN = -6;
export const FERMENTATION_BRIX_MAX = 80;

export type FermentationSugarScale = 'brix' | 'gravity';

/** Convert specific gravity to Brix (ASBC polynomial). */
export function sgToBrix(sg: number): number {
  if (!Number.isFinite(sg) || sg < FERMENTATION_GRAVITY_MIN) return 0;
  const brix = ((182.4601 * sg - 775.6821) * sg + 1262.7794) * sg - 669.5622;
  const rounded = Math.round(brix * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

export function formatFermentationReading(scale: FermentationSugarScale, brix: number): string {
  if (scale === 'gravity') return brixToSg(brix).toFixed(3);
  return (Math.round(brix * 10) / 10).toFixed(1);
}

/**
 * Brix stored for a fermentation reading. Gravity is converted; Brix is kept.
 * Returns null when the text is empty or not a reading on that scale.
 */
export function brixFromFermentationReading(scale: FermentationSugarScale, raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  if (scale === 'gravity') {
    if (!/^\d+\.\d+$/.test(text) || value < FERMENTATION_GRAVITY_MIN || value > FERMENTATION_GRAVITY_MAX) return null;
    return sgToBrix(value);
  }
  if (value < FERMENTATION_BRIX_MIN || value > FERMENTATION_BRIX_MAX) return null;
  return Math.round(value * 10) / 10;
}

/** Why a typed fermentation reading cannot be saved. Empty is allowed here. */
export function fermentationReadingError(
  scale: FermentationSugarScale,
  raw: string,
  options?: { requirePositive?: boolean },
): string | null {
  const text = raw.trim();
  if (!text) return null;
  const brix = brixFromFermentationReading(scale, text);
  if (brix == null) {
    return scale === 'gravity'
      ? 'Enter specific gravity, such as 1.050.'
      : `Enter Brix between ${FERMENTATION_BRIX_MIN} and ${FERMENTATION_BRIX_MAX}.`;
  }
  if (options?.requirePositive) return actualStartBrixError(brix);
  return null;
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
