import { abvFromProof, proofFromAbv } from './spirit-gauging';

/** TTB standard temperature for proof/ABV readings. */
export const STANDARD_GAUGING_TEMP_F = 60;

const TEMP_TOLERANCE_F = 0.05;

function roundProof(proof: number): number {
  return Math.round((proof + Number.EPSILON) * 10) / 10;
}

function roundAbv(abv: number): number {
  return Math.round((abv + Number.EPSILON) * 100) / 100;
}

/**
 * Temperature slope (proof per °F) calibrated to TTB Gauging Manual Table 1 examples
 * (27 CFR §30.23 / §30.61), including 80 proof @ 68°F and 192.82 proof @ 72.15°F.
 */
function proofSlopePerDegreeF(observedProof: number): number {
  return -0.6 + 0.001875 * observedProof;
}

/** True proof at 60 °F from an observed hydrometer proof at sample temperature. */
export function correctProofTo60F(observedProof: number, temperatureF: number): number {
  if (!Number.isFinite(observedProof) || observedProof <= 0) return 0;
  if (!Number.isFinite(temperatureF) || Math.abs(temperatureF - STANDARD_GAUGING_TEMP_F) <= TEMP_TOLERANCE_F) {
    return roundProof(observedProof);
  }
  const corrected = observedProof + (temperatureF - STANDARD_GAUGING_TEMP_F) * proofSlopePerDegreeF(observedProof);
  return roundProof(Math.max(0, corrected));
}

/** ABV at 60 °F from an observed ABV at sample temperature. */
export function correctAbvTo60F(observedAbv: number, temperatureF: number): number {
  if (!Number.isFinite(observedAbv) || observedAbv <= 0) return 0;
  const correctedProof = correctProofTo60F(proofFromAbv(observedAbv), temperatureF);
  return roundAbv(abvFromProof(correctedProof));
}

export function needsTemperatureCorrection(temperatureF: number | null | undefined): boolean {
  return temperatureF != null
    && Number.isFinite(temperatureF)
    && Math.abs(temperatureF - STANDARD_GAUGING_TEMP_F) > TEMP_TOLERANCE_F;
}

export interface AbvTemperatureCorrectionResult {
  observedAbv: number;
  temperatureF: number;
  correctedAbv: number;
  correctedProof: number;
  applied: boolean;
}

/** Volume-weighted blend ABV (both ABVs should be on the same 60 °F basis). */
export function blendVolumeWeightedAbv(
  existingVolumeGal: number,
  existingAbv: number,
  addedVolumeGal: number,
  addedAbv: number,
): number | null {
  const totalVolume = existingVolumeGal + addedVolumeGal;
  if (totalVolume <= 0 || addedAbv <= 0) return null;
  const pureAlcohol = existingVolumeGal * existingAbv / 100 + addedVolumeGal * addedAbv / 100;
  return roundAbv((pureAlcohol / totalVolume) * 100);
}

export function applyAbvTemperatureCorrection(
  observedAbv: number | null | undefined,
  temperatureF: number | null | undefined,
): AbvTemperatureCorrectionResult | null {
  if (observedAbv == null || !Number.isFinite(observedAbv) || observedAbv <= 0) return null;
  const temp = temperatureF != null && Number.isFinite(temperatureF) ? temperatureF : STANDARD_GAUGING_TEMP_F;
  const correctedProof = correctProofTo60F(proofFromAbv(observedAbv), temp);
  const correctedAbv = abvFromProof(correctedProof);
  return {
    observedAbv,
    temperatureF: temp,
    correctedAbv,
    correctedProof,
    applied: needsTemperatureCorrection(temp),
  };
}
