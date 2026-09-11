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

const LBS_PER_KG = 2.20462;
const LITERS_PER_US_GAL = 3.78541;
/** Liters of volume occupied by 1 kg sucrose when dissolved. */
const SUGAR_DISPLACEMENT_L_PER_KG = 0.63;
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
