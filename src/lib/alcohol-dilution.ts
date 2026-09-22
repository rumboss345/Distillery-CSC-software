import { ML_PER_GALLON } from '../types';

/** Which volume field the user fixed (matches common dilution calculators). */
export type DilutionVolumeBasis = 'before' | 'after';

export interface AlcoholDilutionInput {
  /** ABV % vol/vol before dilution. */
  actualAbvPercent: number;
  /** Desired ABV % vol/vol after dilution. */
  targetAbvPercent: number;
  /** Fixed volume in liters (interpretation depends on volumeBasis). */
  volumeLiters: number;
  volumeBasis: DilutionVolumeBasis;
}

export interface AlcoholDilutionResult {
  spiritVolumeLiters: number;
  waterVolumeLiters: number;
  finalVolumeLiters: number;
  actualAbvPercent: number;
  targetAbvPercent: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Linear dilution: pure alcohol volume conserved; mix volume = spirit + water (no contraction).
 * @see https://www.distilling-spirits.com/tools/calculations/diluting-alcohol/
 */
export function computeAlcoholDilution(
  input: AlcoholDilutionInput,
): AlcoholDilutionResult | null {
  const { actualAbvPercent: a1, targetAbvPercent: a2, volumeLiters, volumeBasis } = input;
  if (
    !Number.isFinite(a1) || !Number.isFinite(a2) || !Number.isFinite(volumeLiters)
    || a1 <= 0 || a2 <= 0 || volumeLiters <= 0
  ) {
    return null;
  }
  if (a2 >= a1) return null;

  const r1 = a1 / 100;
  const r2 = a2 / 100;

  let spiritL: number;
  let finalL: number;

  if (volumeBasis === 'before') {
    spiritL = volumeLiters;
    finalL = volumeLiters * r1 / r2;
  } else {
    finalL = volumeLiters;
    spiritL = volumeLiters * r2 / r1;
  }

  const waterL = finalL - spiritL;
  if (waterL < -0.001) return null;

  return {
    spiritVolumeLiters: round2(spiritL),
    waterVolumeLiters: round2(Math.max(0, waterL)),
    finalVolumeLiters: round2(finalL),
    actualAbvPercent: a1,
    targetAbvPercent: a2,
  };
}

const litersToUsGal = (liters: number) => (liters * 1000) / ML_PER_GALLON;

export function formatDilutionSummary(result: AlcoholDilutionResult, unit: 'l' | 'gal'): string {
  const factor = unit === 'gal' ? litersToUsGal(1) : 1;
  const fmt = (liters: number) => {
    const v = liters * factor;
    return unit === 'gal' ? `${v.toFixed(2)} US gal` : `${v.toFixed(2)} L`;
  };
  return `${fmt(result.spiritVolumeLiters)} of spirit at ${result.actualAbvPercent.toFixed(2)}% vol `
    + `mixed with ${fmt(result.waterVolumeLiters)} of water `
    + `→ ${fmt(result.finalVolumeLiters)} at ${result.targetAbvPercent.toFixed(2)}% vol.`;
}
