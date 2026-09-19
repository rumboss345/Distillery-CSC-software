import { solveWaterForTargetAbv } from './blend-formulation';
import { LITERS_PER_US_GALLON } from '../services/spirit-gauging';

/** US wine gallons per milliliter (TTB physical volume basis). */
export const ML_PER_US_GALLON = LITERS_PER_US_GALLON * 1000;

export interface DilutionResult {
  waterGal: number;
  finalVolumeGal: number;
  finalAbv: number;
}

/** Proofing water to reach target ABV (same mass-balance model as blending). */
export function computeDilutionWaterGal(
  volumeGal: number,
  currentAbv: number,
  targetAbv: number,
): DilutionResult | null {
  if (volumeGal <= 0 || currentAbv <= 0 || targetAbv <= 0) return null;
  if (targetAbv >= currentAbv) return null;

  const solved = solveWaterForTargetAbv(
    [{ volumeGal, abv: currentAbv }],
    [],
    targetAbv,
  );
  if (!solved) return null;

  return {
    waterGal: solved.waterGal,
    finalVolumeGal: solved.result.volumeGal,
    finalAbv: solved.result.abv,
  };
}

export interface BottleYieldResult {
  bottleCount: number;
  volumePerBottleGal: number;
  usedVolumeGal: number;
  remainderGal: number;
  fillableVolumeGal: number;
}

/** Whole bottles that fit in available spirit volume (optional bottling loss %). */
export function computeBottleYield(
  volumeGal: number,
  bottleSizeMl: number,
  lossPercent = 0,
): BottleYieldResult | null {
  if (volumeGal <= 0 || bottleSizeMl <= 0) return null;

  const volumePerBottleGal = bottleSizeMl / ML_PER_US_GALLON;
  const fillableVolumeGal = volumeGal * (1 - Math.max(0, Math.min(100, lossPercent)) / 100);
  const bottleCount = Math.floor(fillableVolumeGal / volumePerBottleGal + 1e-9);
  const usedVolumeGal = bottleCount * volumePerBottleGal;
  const remainderGal = Math.max(0, fillableVolumeGal - usedVolumeGal);

  return {
    bottleCount,
    volumePerBottleGal,
    usedVolumeGal,
    remainderGal,
    fillableVolumeGal,
  };
}
