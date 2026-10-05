import { decimalStringFromNumber } from './calc-engine/number-bridge';
import { previewProofing } from './calc-engine/proofing';
import { WATER_LBS_PER_US_GALLON } from './material-densities';
import { ML_PER_GALLON } from '../types';

export { WATER_LBS_PER_US_GALLON };

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

/**
 * Compatibility wrapper around the Table 6 proofing engine.
 * Equal ABV needs no water. A higher target is refused.
 * Numbers are accepted only at this boundary; the engine uses decimal strings.
 */
export function computeAlcoholDilution(
  input: AlcoholDilutionInput,
): AlcoholDilutionResult | null {
  const { actualAbvPercent: a1, targetAbvPercent: a2, volumeLiters, volumeBasis } = input;
  if (
    !Number.isFinite(a1) || !Number.isFinite(a2) || !Number.isFinite(volumeLiters)
    || a1 <= 0 || a2 <= 0 || volumeLiters <= 0 || a2 > a1
  ) {
    return null;
  }
  const startingAbv = decimalStringFromNumber(a1);
  const targetAbv = decimalStringFromNumber(a2);
  const volume = decimalStringFromNumber(volumeLiters);
  const result = volumeBasis === 'before'
    ? previewProofing({
      kind: 'spirit-to-target',
      spiritQuantity: volume,
      spiritUnit: 'L',
      startingAbv,
      targetAbv,
      referenceTemperatureF: '60',
    })
    : previewProofing({
      kind: 'finished-volume',
      finishedQuantity: volume,
      finishedUnit: 'L',
      startingAbv,
      targetAbv,
      referenceTemperatureF: '60',
    });
  if (!result.ok || !('finishedVolumeL' in result)) return null;
  return {
    spiritVolumeLiters: Number(result.startingVolumeL),
    waterVolumeLiters: Number(result.waterVolumeL),
    finalVolumeLiters: Number(result.finishedVolumeL),
    actualAbvPercent: a1,
    targetAbvPercent: a2,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const litersToUsGal = (liters: number) => (liters * 1000) / ML_PER_GALLON;

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
