import { LITERS_PER_US_GALLON, proofFromAbv, weightFromWineGallons, wineGallonsFromLiters } from '../services/spirit-gauging';
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

const wineGallonsToLiters = (wineGallons: number) => wineGallons * LITERS_PER_US_GALLON;

/**
 * Proofing water with volume contraction via TTB Table No. 3.
 * Pure alcohol (proof gallons) is conserved; spirit and blend weights come from Table 3,
 * so the water added is less than a naive spirit+water volume sum (contraction).
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

  const proofStart = proofFromAbv(a1);
  const proofTarget = proofFromAbv(a2);
  const r1 = proofStart / 100;
  const r2 = proofTarget / 100;

  let spiritWineGal: number;
  let finalWineGal: number;

  if (volumeBasis === 'before') {
    spiritWineGal = wineGallonsFromLiters(volumeLiters);
    const proofGallons = spiritWineGal * r1;
    finalWineGal = proofGallons / r2;
  } else {
    finalWineGal = wineGallonsFromLiters(volumeLiters);
    const proofGallons = finalWineGal * r2;
    spiritWineGal = proofGallons / r1;
  }

  if (spiritWineGal <= 0 || finalWineGal <= 0 || finalWineGal < spiritWineGal - 1e-9) {
    return null;
  }

  const spiritWeightLb = weightFromWineGallons(spiritWineGal, proofStart);
  const finalWeightLb = weightFromWineGallons(finalWineGal, proofTarget);
  const waterWeightLb = finalWeightLb - spiritWeightLb;
  if (waterWeightLb < -0.005) return null;

  const waterWineGal = Math.max(0, waterWeightLb) / WATER_LBS_PER_US_GALLON;

  return {
    spiritVolumeLiters: round2(wineGallonsToLiters(spiritWineGal)),
    waterVolumeLiters: round2(wineGallonsToLiters(waterWineGal)),
    finalVolumeLiters: round2(wineGallonsToLiters(finalWineGal)),
    actualAbvPercent: a1,
    targetAbvPercent: a2,
  };
}

const litersToUsGal = (liters: number) => (liters * 1000) / ML_PER_GALLON;

/** Proofing water at 60 °F (8.34 lb/US wine gal). */
export const WATER_LBS_PER_US_GALLON = 8.34;

export function waterLitersToWeightLb(liters: number): number {
  if (!Number.isFinite(liters) || liters <= 0) return 0;
  return round2(litersToUsGal(liters) * WATER_LBS_PER_US_GALLON);
}

export function waterLitersToWeightKg(liters: number): number {
  return round2(waterLitersToWeightLb(liters) / 2.2046226218);
}

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
