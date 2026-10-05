import {
  GRAMS_PER_POUND,
  LITERS_PER_US_GALLON,
  TTB_WATER_POUNDS_PER_GALLON_TABLE6,
} from './constants';
import { Decimal, dec, roundFixed, snapshotJson, type SnapshotValue } from './decimal';
import { ROUNDING } from './rounding';
import { fail, type EngineFailure } from './results';
import { table6At, type GravityBasis } from './table6';

/**
 * Ethanol-water proofing at 60 °F.
 *
 * Standard: TTB Gauging Manual Table 6, 27 CFR §30.66, specific gravity in air
 * (or vacuum, only when the caller names that column). The water weight factor
 * is the 8.32823 lb/wine gallon printed in the §30.66 Table 6 example.
 * It is not 1 L = 1 kg, and it is not a straight line between water and
 * pure ethanol.
 *
 * Mass is conserved. Absolute alcohol mass is conserved. Finished volume is
 * finished mass divided by the Table 6 density at the finished proof.
 * Contraction is poured volume minus that finished volume.
 *
 * Water mass is the unique solution of the Table 6 mass-fraction equation.
 * The finished proof is read back by an 80-step search and must match the
 * target far inside ±0.01% ABV. Posted figures are rounded only with ROUNDING.
 */

export const PROOFING_ENGINE_VERSION = 'ttb-table6-60f-1';
export const ALCOHOLOMETRY_STANDARD = 'TTB-Table-6-27CFR-30.66';
export const ROUNDING_POLICY_VERSION = 'rounding-1';
export const PROOFING_REFERENCE_TEMPERATURE_F = '60.0';
export const ABV_MATCH_TOLERANCE = '0.01';

const WATER_LB_PER_GAL = dec(TTB_WATER_POUNDS_PER_GALLON_TABLE6);
const LITERS_PER_GAL = dec(LITERS_PER_US_GALLON);
const GRAMS_PER_LB = dec(GRAMS_PER_POUND);
const SOLVER_STEPS = 80;

export type ProofingQuantityUnit = 'L' | 'gal' | 'kg' | 'lb';
export type ProofingVolumeUnit = 'L' | 'gal';
export type ProofingMassUnit = 'kg' | 'lb';

export interface SpiritChargeInput {
  quantity: string;
  unit: ProofingQuantityUnit;
  /** ABV percent at 60 °F. Not an observed hydrometer reading. */
  abv: string;
}

interface ProofingRequestBase {
  /** Must be 60 °F. Any other Fahrenheit value is rejected, not converted. */
  referenceTemperatureF?: string;
  /** If set, the call is rejected. OIML 20 °C is a different standard. */
  referenceTemperatureC?: string;
  /** Celsius is rejected even when the number is 60. */
  temperatureScale?: 'F' | 'C';
  /** Table 6 column. Vacuum is still 60 °F, not OIML. Default air. */
  gravityBasis?: GravityBasis;
  /** Recorded only. Never used as the density basis. */
  observedAbv?: string;
  observedTemperatureF?: string;
}

export type ProofingRequest = ProofingRequestBase & (
  | {
    kind: 'spirit-to-target';
    spiritQuantity?: string;
    spiritUnit?: ProofingQuantityUnit;
    startingAbv?: string;
    spirits?: SpiritChargeInput[];
    targetAbv: string;
  }
  | {
    kind: 'spirit-plus-water';
    spiritQuantity?: string;
    spiritUnit?: ProofingQuantityUnit;
    startingAbv?: string;
    spirits?: SpiritChargeInput[];
    waterQuantity: string;
    waterUnit: ProofingQuantityUnit;
    /** When set, posting requires the resulting ABV to match within ±0.01. */
    targetAbv?: string;
  }
  | {
    kind: 'finished-volume';
    finishedQuantity: string;
    finishedUnit: ProofingVolumeUnit;
    startingAbv: string;
    targetAbv: string;
  }
  | {
    kind: 'finished-mass';
    finishedQuantity: string;
    finishedUnit: ProofingMassUnit;
    startingAbv: string;
    targetAbv: string;
  }
  | {
    kind: 'mass-and-gravity';
    finishedMass: string;
    massUnit: ProofingMassUnit;
    specificGravity: string;
    gravityBasis?: GravityBasis;
  }
);

export interface ProofingCheck {
  name: 'mass-balance' | 'alcohol-balance' | 'target-proof' | 'density' | 'volume' | 'contraction';
  passed: boolean;
  detail: string;
}

export interface ProofingMovement {
  direction: 'consume' | 'produce';
  item: 'high-proof-spirit' | 'proofing-water' | 'finished-spirit';
  volumeGal: string;
  volumeL: string;
  massLb: string;
  massKg: string;
  abv: string;
  referenceTemperatureF: string;
  sourceLot: string | null;
  batchId: string | null;
}

export interface ProofingPostContext {
  sourceLot?: string | null;
  batchId?: string | null;
  /**
   * When false, proofing water stays on the snapshot but is not an inventory
   * movement. Tank spirit and finished spirit are still listed when the
   * calculation passes.
   */
  trackProofingWater?: boolean;
}

interface Charge {
  volumeGal: Decimal;
  massLb: Decimal;
  ethanolLb: Decimal;
  abv: Decimal;
  proof: Decimal;
}

export interface ProofingCalculated {
  ok: boolean;
  warnings: string[];
  checks: ProofingCheck[];
  snapshot: string;
  engineVersion: string;
  alcoholometryStandard: string;
  roundingPolicyVersion: string;
  referenceTemperatureF: string;
  gravityBasis: GravityBasis;
  startingAbv: string;
  targetAbv: string | null;
  finalAbv: string;
  startingProof: string;
  finalProof: string;
  startingSpecificGravity: string;
  finishedSpecificGravity: string;
  waterPoundsPerGallon: string;
  startingDensityLbPerGal: string;
  finishedDensityLbPerGal: string;
  finishedDensityGPerMl: string;
  startingMassLb: string;
  startingMassKg: string;
  ethanolMassLb: string;
  ethanolMassKg: string;
  spiritWaterMassLb: string;
  spiritWaterMassKg: string;
  waterMassLb: string;
  waterMassKg: string;
  finishedMassLb: string;
  finishedMassKg: string;
  startingVolumeL: string;
  startingVolumeGal: string;
  waterVolumeL: string;
  waterVolumeGal: string;
  premixVolumeL: string;
  premixVolumeGal: string;
  finishedVolumeL: string;
  finishedVolumeGal: string;
  contractionVolumeL: string;
  contractionVolumeGal: string;
  contractionPercent: string;
  proofGallons: string;
  wineGallons: string;
}

export type ProofingPreview = ProofingCalculated | EngineFailure;

export interface ProofingPost extends ProofingCalculated {
  movements: ProofingMovement[];
}

interface Work {
  warnings: string[];
  basis: GravityBasis;
  observedAbv: string | null;
  observedTemperatureF: string | null;
  charges: Charge[];
  waterLb: Decimal;
  targetAbv: Decimal | null;
  originalInputs: string;
}

function sgAt(proof: Decimal, basis: GravityBasis): Decimal {
  const row = table6At(proof);
  return basis === 'air' ? row.sgAir : row.sgVacuum;
}

function massFraction(proof: Decimal, basis: GravityBasis): Decimal {
  if (proof.lte(0)) return dec('0');
  const sg = sgAt(proof, basis);
  const sgAlcohol = sgAt(dec('200'), basis);
  return proof.div(200).times(sgAlcohol).div(sg);
}

function proofFromMassFraction(fraction: Decimal, basis: GravityBasis): Decimal {
  if (fraction.lte(0)) return dec('0');
  const pure = massFraction(dec('200'), basis);
  if (fraction.gte(pure)) return dec('200');
  let lo = dec('0');
  let hi = dec('200');
  for (let step = 0; step < SOLVER_STEPS; step += 1) {
    const mid = lo.plus(hi).div(2);
    if (massFraction(mid, basis).gt(fraction)) hi = mid;
    else lo = mid;
  }
  return lo.plus(hi).div(2);
}

function lbPerGal(proof: Decimal, basis: GravityBasis): Decimal {
  return sgAt(proof, basis).times(WATER_LB_PER_GAL);
}

function toLb(quantity: Decimal, unit: ProofingMassUnit): Decimal {
  if (unit === 'lb') return quantity;
  return quantity.times(1000).div(GRAMS_PER_LB);
}

function fromLbToKg(pounds: Decimal): Decimal {
  return pounds.times(GRAMS_PER_LB).div(1000);
}

function gallonsFromLiters(liters: Decimal): Decimal {
  return liters.div(LITERS_PER_GAL);
}

function litersFromGallons(gallons: Decimal): Decimal {
  return gallons.times(LITERS_PER_GAL);
}

function waterGallonsFromLb(pounds: Decimal): Decimal {
  return pounds.div(WATER_LB_PER_GAL);
}

function parseDecimal(value: string, label: string): Decimal {
  try {
    return dec(value);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : 'Invalid decimal'}`);
  }
}

function referenceError(request: ProofingRequestBase): string | null {
  if (request.temperatureScale === 'C' || (request.referenceTemperatureC != null && request.referenceTemperatureC.trim() !== '')) {
    return 'A Celsius reference was supplied. This engine does not convert it and does not apply OIML alcoholometry at 20 °C. ABV at 20 °C is not ABV at 60 °F.';
  }
  const text = request.referenceTemperatureF ?? '60';
  let temperature: Decimal;
  try {
    temperature = dec(text);
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid reference temperature.';
  }
  if (!temperature.eq(60)) {
    return `This proofing engine accepts only ABV at 60 °F. ${text} °F was not treated as 60 °F and was not converted.`;
  }
  return null;
}

function chargeFromAbv(quantity: string, unit: ProofingQuantityUnit, abvText: string, basis: GravityBasis): Charge {
  const amount = parseDecimal(quantity, 'Spirit quantity');
  const abv = parseDecimal(abvText, 'Starting ABV');
  if (amount.lte(0)) throw new Error('Spirit quantity must be greater than zero.');
  if (abv.lte(0) || abv.gt(100)) throw new Error('Starting ABV must be greater than 0 and at most 100% at 60 °F.');
  const proof = abv.times(2);
  const density = lbPerGal(proof, basis);
  let volumeGal: Decimal;
  let massLb: Decimal;
  if (unit === 'gal') {
    volumeGal = amount;
    massLb = amount.times(density);
  } else if (unit === 'L') {
    volumeGal = gallonsFromLiters(amount);
    massLb = volumeGal.times(density);
  } else if (unit === 'lb') {
    massLb = amount;
    volumeGal = amount.div(density);
  } else {
    massLb = toLb(amount, 'kg');
    volumeGal = massLb.div(density);
  }
  const ethanolLb = massLb.times(massFraction(proof, basis));
  return { volumeGal, massLb, ethanolLb, abv, proof };
}

function combine(charges: Charge[], basis: GravityBasis): Charge {
  if (charges.length === 1) return charges[0];
  const volumeGal = charges.reduce((sum, charge) => sum.plus(charge.volumeGal), dec('0'));
  const massLb = charges.reduce((sum, charge) => sum.plus(charge.massLb), dec('0'));
  const ethanolLb = charges.reduce((sum, charge) => sum.plus(charge.ethanolLb), dec('0'));
  const fraction = massLb.eq(0) ? dec('0') : ethanolLb.div(massLb);
  const proof = proofFromMassFraction(fraction, basis);
  return {
    volumeGal,
    massLb,
    ethanolLb,
    abv: proof.div(2),
    proof,
  };
}

function waterLbFromQuantity(quantity: string, unit: ProofingQuantityUnit): Decimal {
  const amount = parseDecimal(quantity, 'Water quantity');
  if (amount.lt(0)) throw new Error('Water quantity cannot be negative.');
  if (unit === 'lb') return amount;
  if (unit === 'kg') return toLb(amount, 'kg');
  if (unit === 'gal') return amount.times(WATER_LB_PER_GAL);
  if (unit === 'L') return gallonsFromLiters(amount).times(WATER_LB_PER_GAL);
  throw new Error('Water unit must be L, gal, kg, or lb.');
}

function spiritList(request: ProofingRequest): SpiritChargeInput[] {
  if (request.kind === 'finished-volume' || request.kind === 'finished-mass' || request.kind === 'mass-and-gravity') {
    return [];
  }
  if (request.spirits && request.spirits.length > 0) {
    if (request.spiritQuantity != null || request.startingAbv != null) {
      throw new Error('Pass either one spirit quantity or a list of spirits, not both.');
    }
    return request.spirits;
  }
  if (request.spiritQuantity == null || request.spiritUnit == null || request.startingAbv == null) {
    throw new Error('Enter the starting spirit quantity, unit, and ABV at 60 °F.');
  }
  return [{ quantity: request.spiritQuantity, unit: request.spiritUnit, abv: request.startingAbv }];
}

function solveWaterLb(spirit: Charge, targetProof: Decimal, basis: GravityBasis): Decimal {
  if (targetProof.eq(spirit.proof)) return dec('0');
  const fraction = massFraction(targetProof, basis);
  if (fraction.lte(0)) throw new Error('Target ABV must be greater than zero.');
  const closedForm = spirit.ethanolLb.div(fraction).minus(spirit.massLb);
  if (closedForm.lt('-1e-9')) {
    throw new Error('Target ABV is above the starting ABV. Water cannot raise proof.');
  }
  if (closedForm.lte(0)) return dec('0');

  const confirmed = proofFromMassFraction(
    spirit.ethanolLb.div(spirit.massLb.plus(closedForm)),
    basis,
  ).div(2);
  if (confirmed.minus(targetProof.div(2)).abs().gt('1e-9')) {
    throw new Error('The water solver and the Table 6 mass balance disagree.');
  }
  return closedForm;
}

function parseWork(request: ProofingRequest): Work | string {
  const basisError = referenceError(request);
  if (basisError) return basisError;
  const basis = request.gravityBasis ?? 'air';
  const warnings: string[] = [];
  if (basis === 'vacuum') {
    warnings.push('Table 6 vacuum specific gravity is still the 60 °F gauging table, not OIML at 20 °C.');
  }
  if (request.observedTemperatureF != null && request.observedTemperatureF.trim() !== '') {
    try {
      const observed = dec(request.observedTemperatureF);
      if (!observed.eq(60)) {
        warnings.push('Observed sample temperature was recorded only. Density and the ABV used here are at 60 °F.');
      }
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid observed temperature.';
    }
  }

  try {
    if (request.kind === 'mass-and-gravity') {
      return {
        warnings,
        basis,
        observedAbv: request.observedAbv ?? null,
        observedTemperatureF: request.observedTemperatureF ?? null,
        charges: [],
        waterLb: dec('0'),
        targetAbv: null,
        originalInputs: JSON.stringify(request),
      };
    }

    if (request.kind === 'finished-volume' || request.kind === 'finished-mass') {
      const startingAbv = parseDecimal(request.startingAbv, 'Starting ABV');
      const targetAbv = parseDecimal(request.targetAbv, 'Target ABV');
      if (startingAbv.lte(0) || startingAbv.gt(100)) return 'Starting ABV must be greater than 0 and at most 100% at 60 °F.';
      if (targetAbv.lte(0) || targetAbv.gt(100)) return 'Target ABV must be greater than 0 and at most 100% at 60 °F.';
      if (targetAbv.gt(startingAbv)) return 'Target ABV is above the starting ABV. Water cannot raise proof.';
      const targetProof = targetAbv.times(2);
      const startProof = startingAbv.times(2);
      let finishedLb: Decimal;
      if (request.kind === 'finished-volume') {
        const amount = parseDecimal(request.finishedQuantity, 'Finished volume');
        if (amount.lte(0)) return 'Finished volume must be greater than zero.';
        const gallons = request.finishedUnit === 'gal' ? amount : gallonsFromLiters(amount);
        finishedLb = gallons.times(lbPerGal(targetProof, basis));
      } else {
        const amount = parseDecimal(request.finishedQuantity, 'Finished mass');
        if (amount.lte(0)) return 'Finished mass must be greater than zero.';
        finishedLb = toLb(amount, request.finishedUnit);
      }
      const ethanolLb = finishedLb.times(massFraction(targetProof, basis));
      const startDensity = lbPerGal(startProof, basis);
      const spiritLb = ethanolLb.div(massFraction(startProof, basis));
      const spiritGal = spiritLb.div(startDensity);
      const waterLb = finishedLb.minus(spiritLb);
      if (waterLb.lt('-0.000000001')) return 'Target ABV is above the starting ABV. Water cannot raise proof.';
      return {
        warnings,
        basis,
        observedAbv: request.observedAbv ?? null,
        observedTemperatureF: request.observedTemperatureF ?? null,
        charges: [{
          volumeGal: spiritGal,
          massLb: spiritLb,
          ethanolLb,
          abv: startingAbv,
          proof: startProof,
        }],
        waterLb: Decimal.max(waterLb, 0),
        targetAbv,
        originalInputs: JSON.stringify(request),
      };
    }

    const list = spiritList(request);
    const charges = list.map((spirit) => chargeFromAbv(spirit.quantity, spirit.unit, spirit.abv, basis));
    const spirit = combine(charges, basis);
    let targetAbv: Decimal | null = null;
    let waterLb = dec('0');
    if (request.kind === 'spirit-to-target') {
      targetAbv = parseDecimal(request.targetAbv, 'Target ABV');
      if (targetAbv.lte(0) || targetAbv.gt(100)) return 'Target ABV must be greater than 0 and at most 100% at 60 °F.';
      if (targetAbv.gt(spirit.abv)) return 'Target ABV is above the starting ABV. Water cannot raise proof.';
      waterLb = solveWaterLb(spirit, targetAbv.times(2), basis);
    } else {
      waterLb = waterLbFromQuantity(request.waterQuantity, request.waterUnit);
      if (request.targetAbv != null && request.targetAbv.trim() !== '') {
        targetAbv = parseDecimal(request.targetAbv, 'Target ABV');
        if (targetAbv.lte(0) || targetAbv.gt(100)) return 'Target ABV must be greater than 0 and at most 100% at 60 °F.';
      }
    }
    if (spirit.proof.gt(0) && (table6At(spirit.proof).interpolated || (targetAbv != null && table6At(targetAbv.times(2)).interpolated))) {
      warnings.push('Table 6 is printed at whole proofs. Water and specific gravity were interpolated between adjacent proofs.');
    }
    return {
      warnings,
      basis,
      observedAbv: request.observedAbv ?? null,
      observedTemperatureF: request.observedTemperatureF ?? null,
      charges,
      waterLb,
      targetAbv,
      originalInputs: JSON.stringify(request),
    };
  } catch (error) {
    return error instanceof Error ? error.message : 'Proofing input could not be read.';
  }
}

function finishMixture(work: Work): ProofingCalculated {
  const basis = work.basis;
  const spirit = combine(work.charges, basis);
  const waterLb = work.waterLb;
  const finishedLb = spirit.massLb.plus(waterLb);
  const fraction = finishedLb.eq(0) ? dec('0') : spirit.ethanolLb.div(finishedLb);
  const finalProof = proofFromMassFraction(fraction, basis);
  const finalAbv = finalProof.div(2);
  const finishedDensity = lbPerGal(finalProof, basis);
  const finishedGal = finishedDensity.eq(0) ? dec('0') : finishedLb.div(finishedDensity);
  const waterGal = waterGallonsFromLb(waterLb);
  const premixGal = spirit.volumeGal.plus(waterGal);
  const contractionGal = premixGal.minus(finishedGal);
  const contractionPercent = premixGal.eq(0) ? dec('0') : contractionGal.div(premixGal).times(100);
  const startDensity = spirit.volumeGal.eq(0) ? dec('0') : spirit.massLb.div(spirit.volumeGal);
  const startSg = spirit.proof.eq(0) ? dec('1') : sgAt(spirit.proof, basis);
  const finishedSg = finalProof.eq(0) ? dec('1') : sgAt(finalProof, basis);
  const ethanolFromFinished = finishedLb.times(massFraction(finalProof, basis));
  const proofGallons = finishedGal.times(finalProof).div(100);

  const targetCheckPassed = work.targetAbv == null || finalAbv.minus(work.targetAbv).abs().lte(ABV_MATCH_TOLERANCE);
  const massGap = spirit.massLb.plus(waterLb).minus(finishedLb).abs();
  const postedMassGap = dec(roundFixed(spirit.massLb, ROUNDING.pounds))
    .plus(roundFixed(waterLb, ROUNDING.pounds))
    .minus(roundFixed(finishedLb, ROUNDING.pounds))
    .abs();
  const alcoholGap = spirit.ethanolLb.minus(ethanolFromFinished).abs();
  const densityGap = finishedDensity.minus(finishedSg.times(WATER_LB_PER_GAL)).abs();
  const volumeGap = finishedGal.minus(finishedLb.div(finishedDensity)).abs();
  const contractionGap = contractionGal.minus(premixGal.minus(finishedGal)).abs();

  const checks: ProofingCheck[] = [
    {
      name: 'mass-balance',
      passed: massGap.lte('1e-9') && postedMassGap.lte('0.02'),
      detail: 'Mass balance: starting mass plus added water mass equals finished mass. Posted pounds agree within 0.02 lb.',
    },
    {
      name: 'alcohol-balance',
      passed: alcoholGap.lte('1e-8'),
      detail: 'Alcohol balance: ethanol mass before proofing equals ethanol mass after proofing.',
    },
    {
      name: 'target-proof',
      passed: targetCheckPassed,
      detail: work.targetAbv == null
        ? 'Target proof: no target was set for this mixture.'
        : `Target proof: finished ABV is ${finalAbv.toFixed(6)}% at 60 °F and the target is ${work.targetAbv.toFixed(2)}%. The allowed difference is ${ABV_MATCH_TOLERANCE}% ABV.`,
    },
    {
      name: 'density',
      passed: densityGap.lte('1e-12'),
      detail: `Density: finished pounds per gallon equal Table 6 specific gravity at 60 °F times ${TTB_WATER_POUNDS_PER_GALLON_TABLE6}.`,
    },
    {
      name: 'volume',
      passed: volumeGap.lte('1e-9'),
      detail: 'Volume: finished volume is finished mass divided by the finished density, not the sum of the poured volumes.',
    },
    {
      name: 'contraction',
      passed: contractionGap.lte('1e-9') && contractionGal.gte('-1e-9'),
      detail: 'Contraction: poured volume minus finished volume. The percent is that difference divided by the poured volume.',
    },
  ];

  const posted = {
    engineVersion: PROOFING_ENGINE_VERSION,
    alcoholometryStandard: ALCOHOLOMETRY_STANDARD,
    roundingPolicyVersion: ROUNDING_POLICY_VERSION,
    referenceTemperatureF: PROOFING_REFERENCE_TEMPERATURE_F,
    gravityBasis: basis,
    startingAbv: roundFixed(spirit.abv, ROUNDING.abv),
    targetAbv: work.targetAbv == null ? null : roundFixed(work.targetAbv, ROUNDING.abv),
    finalAbv: roundFixed(finalAbv, ROUNDING.abv),
    startingProof: roundFixed(spirit.proof, ROUNDING.proof),
    finalProof: roundFixed(finalProof, ROUNDING.proof),
    startingSpecificGravity: roundFixed(startSg, ROUNDING.specificGravity),
    finishedSpecificGravity: roundFixed(finishedSg, ROUNDING.specificGravity),
    waterPoundsPerGallon: WATER_LB_PER_GAL.toFixed(ROUNDING.poundsPerGallon),
    startingDensityLbPerGal: roundFixed(startDensity, ROUNDING.poundsPerGallon),
    finishedDensityLbPerGal: roundFixed(finishedDensity, ROUNDING.poundsPerGallon),
    finishedDensityGPerMl: roundFixed(
      finishedDensity.times(GRAMS_PER_LB).div(LITERS_PER_GAL.times(1000)),
      ROUNDING.specificGravity,
    ),
    startingMassLb: roundFixed(spirit.massLb, ROUNDING.pounds),
    startingMassKg: roundFixed(fromLbToKg(spirit.massLb), ROUNDING.kilograms),
    ethanolMassLb: roundFixed(spirit.ethanolLb, ROUNDING.pounds),
    ethanolMassKg: roundFixed(fromLbToKg(spirit.ethanolLb), ROUNDING.kilograms),
    spiritWaterMassLb: roundFixed(spirit.massLb.minus(spirit.ethanolLb), ROUNDING.pounds),
    spiritWaterMassKg: roundFixed(fromLbToKg(spirit.massLb.minus(spirit.ethanolLb)), ROUNDING.kilograms),
    waterMassLb: roundFixed(waterLb, ROUNDING.pounds),
    waterMassKg: roundFixed(fromLbToKg(waterLb), ROUNDING.kilograms),
    finishedMassLb: roundFixed(finishedLb, ROUNDING.pounds),
    finishedMassKg: roundFixed(fromLbToKg(finishedLb), ROUNDING.kilograms),
    startingVolumeL: roundFixed(litersFromGallons(spirit.volumeGal), ROUNDING.liters),
    startingVolumeGal: roundFixed(spirit.volumeGal, ROUNDING.wineGallons),
    waterVolumeL: roundFixed(litersFromGallons(waterGal), ROUNDING.liters),
    waterVolumeGal: roundFixed(waterGal, ROUNDING.wineGallons),
    premixVolumeL: roundFixed(litersFromGallons(premixGal), ROUNDING.liters),
    premixVolumeGal: roundFixed(premixGal, ROUNDING.wineGallons),
    finishedVolumeL: roundFixed(litersFromGallons(finishedGal), ROUNDING.liters),
    finishedVolumeGal: roundFixed(finishedGal, ROUNDING.wineGallons),
    contractionVolumeL: roundFixed(litersFromGallons(contractionGal), ROUNDING.liters),
    contractionVolumeGal: roundFixed(contractionGal, ROUNDING.wineGallons),
    contractionPercent: roundFixed(contractionPercent, ROUNDING.contractionPercent),
    proofGallons: roundFixed(proofGallons, ROUNDING.proofGallons),
    wineGallons: roundFixed(finishedGal, ROUNDING.wineGallons),
  };

  const failed = checks.filter((check) => !check.passed).map((check) => check.name);
  const fields: Record<string, SnapshotValue> = {
    status: failed.length === 0 ? 'calculated' : 'failed-validation',
    validationStatus: failed.length === 0 ? 'passed' : 'failed',
    failedChecks: failed.join(','),
    originalInputs: work.originalInputs,
    observedAbv: work.observedAbv,
    observedTemperatureF: work.observedTemperatureF,
    ...posted,
  };

  return {
    ok: failed.length === 0,
    warnings: work.warnings,
    checks,
    snapshot: snapshotJson(fields),
    ...posted,
  };
}

function finishGravity(request: Extract<ProofingRequest, { kind: 'mass-and-gravity' }>, work: Work): ProofingCalculated | EngineFailure {
  let mass: Decimal;
  let entered: Decimal;
  try {
    const amount = parseDecimal(request.finishedMass, 'Finished mass');
    if (amount.lte(0)) return fail(['Finished mass must be greater than zero.'], { finishedMass: request.finishedMass });
    mass = toLb(amount, request.massUnit);
    entered = parseDecimal(request.specificGravity, 'Specific gravity');
  } catch (error) {
    return fail([error instanceof Error ? error.message : 'Invalid decimal'], {
      finishedMass: request.finishedMass,
      specificGravity: request.specificGravity,
    });
  }
  const low = sgAt(dec('200'), work.basis);
  const high = sgAt(dec('0'), work.basis);
  if (entered.gt(high) || entered.lt(low)) {
    return fail([
      `Specific gravity ${entered.toFixed()} is outside Table 6 at 60 °F on the ${work.basis} basis.`,
    ], { specificGravity: request.specificGravity, gravityBasis: work.basis });
  }
  let lo = dec('0');
  let hi = dec('200');
  for (let step = 0; step < SOLVER_STEPS; step += 1) {
    const mid = lo.plus(hi).div(2);
    if (sgAt(mid, work.basis).gt(entered)) lo = mid;
    else hi = mid;
  }
  const proof = lo.plus(hi).div(2);
  const tableSg = sgAt(proof, work.basis);
  const density = tableSg.times(WATER_LB_PER_GAL);
  const gallons = mass.div(density);
  const abv = proof.div(2);
  const ethanolLb = mass.times(massFraction(proof, work.basis));
  const proofGallons = gallons.times(proof).div(100);
  const gPerMl = density.times(GRAMS_PER_LB).div(LITERS_PER_GAL.times(1000));

  const checks: ProofingCheck[] = [
    {
      name: 'mass-balance',
      passed: true,
      detail: 'Mass balance: this reading is a finished mass. Nothing was added.',
    },
    {
      name: 'alcohol-balance',
      passed: true,
      detail: 'Alcohol balance: ethanol mass is the Table 6 mass fraction of the finished mass.',
    },
    {
      name: 'target-proof',
      passed: true,
      detail: 'Target proof: specific gravity was converted to ABV at 60 °F. No dilution target was set.',
    },
    {
      name: 'density',
      passed: density.minus(tableSg.times(WATER_LB_PER_GAL)).abs().lte('1e-12'),
      detail: 'Density: pounds per gallon are the Table 6 specific gravity nearest the entered gravity, times 8.32823.',
    },
    {
      name: 'volume',
      passed: true,
      detail: 'Volume: finished volume is finished mass divided by that density.',
    },
    {
      name: 'contraction',
      passed: true,
      detail: 'Contraction: not a mixture, so there is no poured-versus-finished difference.',
    },
  ];

  const posted = {
    engineVersion: PROOFING_ENGINE_VERSION,
    alcoholometryStandard: ALCOHOLOMETRY_STANDARD,
    roundingPolicyVersion: ROUNDING_POLICY_VERSION,
    referenceTemperatureF: PROOFING_REFERENCE_TEMPERATURE_F,
    gravityBasis: work.basis,
    startingAbv: roundFixed(abv, ROUNDING.abv),
    targetAbv: null,
    finalAbv: roundFixed(abv, ROUNDING.abv),
    startingProof: roundFixed(proof, ROUNDING.proof),
    finalProof: roundFixed(proof, ROUNDING.proof),
    startingSpecificGravity: roundFixed(tableSg, ROUNDING.specificGravity),
    finishedSpecificGravity: roundFixed(tableSg, ROUNDING.specificGravity),
    waterPoundsPerGallon: WATER_LB_PER_GAL.toFixed(ROUNDING.poundsPerGallon),
    startingDensityLbPerGal: roundFixed(density, ROUNDING.poundsPerGallon),
    finishedDensityLbPerGal: roundFixed(density, ROUNDING.poundsPerGallon),
    finishedDensityGPerMl: roundFixed(gPerMl, ROUNDING.specificGravity),
    startingMassLb: roundFixed(mass, ROUNDING.pounds),
    startingMassKg: roundFixed(fromLbToKg(mass), ROUNDING.kilograms),
    ethanolMassLb: roundFixed(ethanolLb, ROUNDING.pounds),
    ethanolMassKg: roundFixed(fromLbToKg(ethanolLb), ROUNDING.kilograms),
    spiritWaterMassLb: roundFixed(mass.minus(ethanolLb), ROUNDING.pounds),
    spiritWaterMassKg: roundFixed(fromLbToKg(mass.minus(ethanolLb)), ROUNDING.kilograms),
    waterMassLb: roundFixed('0', ROUNDING.pounds),
    waterMassKg: roundFixed('0', ROUNDING.kilograms),
    finishedMassLb: roundFixed(mass, ROUNDING.pounds),
    finishedMassKg: roundFixed(fromLbToKg(mass), ROUNDING.kilograms),
    startingVolumeL: roundFixed(litersFromGallons(gallons), ROUNDING.liters),
    startingVolumeGal: roundFixed(gallons, ROUNDING.wineGallons),
    waterVolumeL: roundFixed('0', ROUNDING.liters),
    waterVolumeGal: roundFixed('0', ROUNDING.wineGallons),
    premixVolumeL: roundFixed(litersFromGallons(gallons), ROUNDING.liters),
    premixVolumeGal: roundFixed(gallons, ROUNDING.wineGallons),
    finishedVolumeL: roundFixed(litersFromGallons(gallons), ROUNDING.liters),
    finishedVolumeGal: roundFixed(gallons, ROUNDING.wineGallons),
    contractionVolumeL: roundFixed('0', ROUNDING.liters),
    contractionVolumeGal: roundFixed('0', ROUNDING.wineGallons),
    contractionPercent: roundFixed('0', ROUNDING.contractionPercent),
    proofGallons: roundFixed(proofGallons, ROUNDING.proofGallons),
    wineGallons: roundFixed(gallons, ROUNDING.wineGallons),
  };

  const fields: Record<string, SnapshotValue> = {
    status: 'calculated',
    validationStatus: 'passed',
    failedChecks: '',
    originalInputs: JSON.stringify(request),
    enteredSpecificGravity: roundFixed(entered, ROUNDING.specificGravity),
    observedAbv: work.observedAbv,
    observedTemperatureF: work.observedTemperatureF,
    ...posted,
  };
  if (entered.minus(tableSg).abs().gt('0.000005')) {
    work.warnings.push('Entered specific gravity sits between printed Table 6 rows. Proof was read from the table, and volume uses that table density.');
  }
  return {
    ok: true,
    warnings: work.warnings,
    checks,
    snapshot: snapshotJson(fields),
    ...posted,
  };
}

/** Preview only. Does not read or write inventory. */
export function previewProofing(request: ProofingRequest): ProofingPreview {
  const parsed = parseWork(request);
  if (typeof parsed === 'string') {
    return fail([parsed], {
      engineVersion: PROOFING_ENGINE_VERSION,
      alcoholometryStandard: ALCOHOLOMETRY_STANDARD,
      referenceTemperatureF: request.referenceTemperatureF ?? null,
    });
  }
  if (request.kind === 'mass-and-gravity') return finishGravity(request, parsed);
  return finishMixture(parsed);
}

/**
 * Posting gate. A failed check returns no movements.
 * This function does not write the database. The caller stores the snapshot
 * and applies movements only after ok is true.
 */
export function postProofing(request: ProofingRequest, context: ProofingPostContext = {}): ProofingPost | EngineFailure {
  const preview = previewProofing(request);
  if (!('finalAbv' in preview)) return preview;
  if (!preview.ok) return { ...preview, movements: [] };
  const sourceLot = context.sourceLot ?? null;
  const batchId = context.batchId ?? null;
  const movements: ProofingMovement[] = [
    {
      direction: 'consume',
      item: 'high-proof-spirit',
      volumeGal: preview.startingVolumeGal,
      volumeL: preview.startingVolumeL,
      massLb: preview.startingMassLb,
      massKg: preview.startingMassKg,
      abv: preview.startingAbv,
      referenceTemperatureF: preview.referenceTemperatureF,
      sourceLot,
      batchId,
    },
  ];
  const waterUsed = dec(preview.waterMassLb).gt(0);
  if (waterUsed && context.trackProofingWater !== false) {
    movements.push({
      direction: 'consume',
      item: 'proofing-water',
      volumeGal: preview.waterVolumeGal,
      volumeL: preview.waterVolumeL,
      massLb: preview.waterMassLb,
      massKg: preview.waterMassKg,
      abv: '0.00',
      referenceTemperatureF: preview.referenceTemperatureF,
      sourceLot: null,
      batchId,
    });
  }
  movements.push({
    direction: 'produce',
    item: 'finished-spirit',
    volumeGal: preview.finishedVolumeGal,
    volumeL: preview.finishedVolumeL,
    massLb: preview.finishedMassLb,
    massKg: preview.finishedMassKg,
    abv: preview.finalAbv,
    referenceTemperatureF: preview.referenceTemperatureF,
    sourceLot,
    batchId,
  });
  const withLedger = snapshotJson({
    ...JSON.parse(preview.snapshot) as Record<string, SnapshotValue>,
    ledgerMovements: JSON.stringify(movements),
    proofingWaterTracked: context.trackProofingWater === false ? 'false' : 'true',
    sourceLot,
    batchId,
  });
  return { ...preview, snapshot: withLedger, movements };
}

/** Posted pounds for one ethanol-water volume at 60 °F. Null when the input is not usable. */
export function postedSpiritPounds(wineGallons: string, abv: string, basis: GravityBasis = 'air'): string | null {
  try {
    const charge = chargeFromAbv(wineGallons, 'gal', abv, basis);
    return roundFixed(charge.massLb, ROUNDING.pounds);
  } catch {
    return null;
  }
}

/** Posted pounds of proofing water from its volume. Uses 8.32823 lb/gal, not 1 kg/L. */
export function postedWaterPounds(wineGallons: string): string | null {
  try {
    const gallons = dec(wineGallons);
    if (gallons.lt(0)) return null;
    return roundFixed(gallons.times(WATER_LB_PER_GAL), ROUNDING.pounds);
  } catch {
    return null;
  }
}
