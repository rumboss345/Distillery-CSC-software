import { WATER_LBS_PER_US_GALLON } from './alcohol-dilution';
import { abvExceedsLimit, MAX_ENTERED_ABV } from './abv-limits';
import { toLbs } from './blending';
import { laaLitersFromVolumeAbv } from './reporting/alcohol-units';
import {
  LITERS_PER_US_GALLON,
  proofFromAbv,
  proofGallonsFromWeight,
  weightFromWineGallons,
  wineGallonsFromWeight,
} from '../services/spirit-gauging';
import { correctAbvTo60F } from '../services/temperature-correction';

/**
 * Apparent specific volume of sucrose in aqueous solution at 20 °C.
 * Flanagan's sucrose functions, citing Bureau of Standards Bulletin 14 (1918–1919)
 * and the CRC Handbook, use a mean of 0.6219 cm³/g above 1208.2 g/L.
 * Dilute solutions are nearer 0.612 cm³/g. This estimates how much volume dissolved
 * sugar adds. It is not an OIML ethanol–water–sucrose density table.
 */
export const SUCROSE_APPARENT_SPECIFIC_VOLUME_ML_PER_G = 0.6219;

/** Dry sucrose bulk density from the distillery blending sheet. Used only to turn a measured dry volume into mass. */
export const SUCROSE_BULK_DENSITY_G_PER_ML = 1.59;

/** CS1 syrup bulk density from the distillery blending sheet (g/ml). */
export const SYRUP_BULK_DENSITY_G_PER_ML = 1.368;

export const FORMULATION_CITATION =
  'Unsweetened blends conserve proof gallons and weight with TTB Table No. 3 (27 CFR §30.63) at 60 °F. '
  + 'Dissolved sucrose adds about 0.6219 ml per gram (Bureau of Standards Bulletin 14 / CRC, via Flanagan). '
  + 'That is not a full ethanol–water–sugar density table. Lab ABV is authoritative once sugar or flavor is present.';

const ML_PER_GALLON = LITERS_PER_US_GALLON * 1000;
const GRAMS_PER_LB = 453.592;

export type FormulationKind = 'spirit' | 'water' | 'sugar' | 'syrup' | 'flavoring' | 'color' | 'other';

export interface FormulationComponent {
  kind: FormulationKind;
  name: string;
  amount: number;
  unit: string;
  abv?: number | null;
  temperatureF?: number | null;
  /** Share of a syrup's mass that is sucrose, from 0 to 1. */
  sucroseMassFraction?: number | null;
}

export interface FormulationAnalysis {
  ok: true;
  volumeGal: number;
  liters: number;
  abv: number;
  proof: number;
  pureAlcoholGal: number;
  laaLiters: number;
  weightLb: number;
  sugarGrams: number;
  sugarGPerL: number | null;
  sucroseMassPercent: number | null;
  contractionGal: number;
  /** Total mass divided by estimated volume. Not a hydrometer proof. */
  densityGPerMl: number | null;
  obscured: boolean;
  model: 'ttb-table-3' | 'ttb-table-3-and-sucrose-volume';
  warnings: string[];
  summary: string;
}

export interface FormulationFailure {
  ok: false;
  message: string;
}

export interface FormulationDesign {
  ok: boolean;
  message: string;
  spiritGal: number;
  spiritAbv: number;
  waterGal: number;
  sugarGrams: number;
  sugarLbs: number;
  analysis: FormulationAnalysis | null;
}

export interface DesignInput {
  targetVolumeGal: number;
  targetAbv: number;
  targetSugarGPerL?: number | null;
  additionSpiritAbv?: number | null;
  additionSpiritTemperatureF?: number | null;
  /** Ingredients already in the vessel. Design solves only what still has to be added. */
  fixed?: FormulationComponent[];
}

export interface BatchCorrectionInput {
  measuredVolumeGal: number;
  measuredAbv: number;
  measuredTemperatureF?: number | null;
  measuredSugarGPerL?: number | null;
  targetVolumeGal: number;
  targetAbv: number;
  targetSugarGPerL?: number | null;
  additionSpiritAbv: number;
  additionSpiritTemperatureF?: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const round4 = (value: number) => Math.round(value * 10000) / 10000;

function canonicalUnit(unit: string): string {
  const value = unit.trim().toLowerCase();
  if (value === 'lb' || value === 'pound' || value === 'pounds') return 'lbs';
  if (value === 'liter' || value === 'litre' || value === 'liters' || value === 'litres') return 'l';
  if (value === 'gallon' || value === 'gallons') return 'gal';
  if (value === 'floz') return 'fl oz';
  return value;
}

function volumeToGal(amount: number, unit: string): number | null {
  if (amount <= 0) return 0;
  switch (canonicalUnit(unit)) {
    case 'gal':
      return amount;
    case 'l':
      return amount / LITERS_PER_US_GALLON;
    case 'ml':
      return amount / ML_PER_GALLON;
    case 'fl oz':
      return amount / 128;
    default:
      return null;
  }
}

function massToGrams(amount: number, unit: string): number | null {
  if (amount <= 0) return 0;
  const unitName = canonicalUnit(unit);
  if (unitName === 'g') return amount;
  if (unitName === 'kg') return amount * 1000;
  const lbs = toLbs(amount, unitName);
  if (lbs <= 0) return null;
  return lbs * GRAMS_PER_LB;
}

function gramsToLbs(grams: number): number {
  if (grams <= 0) return 0;
  return grams / GRAMS_PER_LB;
}

export function sucroseApparentVolumeGal(grams: number): number {
  if (grams <= 0) return 0;
  return (grams * SUCROSE_APPARENT_SPECIFIC_VOLUME_ML_PER_G) / ML_PER_GALLON;
}

function abvAt60(abv: number, temperatureF: number | null | undefined): number {
  if (temperatureF == null || !Number.isFinite(temperatureF)) return abv;
  return correctAbvTo60F(abv, temperatureF);
}

interface HydroPart {
  volumeGal: number;
  weightLb: number;
  pureAlcoholGal: number;
}

function spiritPart(
  volumeGal: number,
  abv: number,
): HydroPart {
  const proof = proofFromAbv(abv);
  return {
    volumeGal,
    weightLb: weightFromWineGallons(volumeGal, proof),
    pureAlcoholGal: volumeGal * abv / 100,
  };
}

interface PreparedBlend {
  hydro: HydroPart;
  /** Volumes poured in, before mixing contraction. */
  inputHydroGal: number;
  sugarGrams: number;
  extraVolumeGal: number;
  extraWeightLb: number;
  warnings: string[];
  obscured: boolean;
}

function prepareBlend(components: FormulationComponent[]): PreparedBlend | FormulationFailure {
  const hydro: HydroPart = { volumeGal: 0, weightLb: 0, pureAlcoholGal: 0 };
  let inputHydroGal = 0;
  let sugarGrams = 0;
  let extraVolumeGal = 0;
  let extraWeightLb = 0;
  const warnings: string[] = [];
  let obscured = false;

  for (const component of components) {
    if (component.amount <= 0) continue;
    const name = component.name.trim() || component.kind;
    if (component.abv != null && abvExceedsLimit(component.abv)) {
      return { ok: false, message: `${name} is over ${MAX_ENTERED_ABV}% ABV.` };
    }

    if (component.kind === 'spirit' || (component.abv != null && component.abv > 0 && component.kind !== 'sugar')) {
      const abv = abvAt60(component.abv ?? 0, component.temperatureF);
      if (abv <= 0) {
        return { ok: false, message: `${name} needs an ABV.` };
      }
      let volumeGal = volumeToGal(component.amount, component.unit);
      if (volumeGal == null) {
        const grams = massToGrams(component.amount, component.unit);
        if (grams == null) {
          return { ok: false, message: `${name} needs a volume or a weight.` };
        }
        const lbs = grams / GRAMS_PER_LB;
        volumeGal = wineGallonsFromWeight(lbs, proofFromAbv(abv));
      }
      if (volumeGal <= 0) continue;
      const part = spiritPart(volumeGal, abv);
      hydro.weightLb += part.weightLb;
      hydro.pureAlcoholGal += part.pureAlcoholGal;
      inputHydroGal += volumeGal;
      if (component.kind !== 'spirit') {
        obscured = true;
        warnings.push(`${name} is treated as spirit for the alcohol balance. Its sugar is not given a separate volume.`);
      }
      continue;
    }

    if (component.kind === 'water') {
      let volumeGal = volumeToGal(component.amount, component.unit);
      let weightLb: number;
      if (volumeGal == null) {
        const grams = massToGrams(component.amount, component.unit);
        if (grams == null) return { ok: false, message: `${name} needs a volume or a weight.` };
        weightLb = grams / GRAMS_PER_LB;
        volumeGal = weightLb / WATER_LBS_PER_US_GALLON;
      } else {
        weightLb = volumeGal * WATER_LBS_PER_US_GALLON;
      }
      hydro.weightLb += weightLb;
      inputHydroGal += volumeGal;
      continue;
    }

    if (component.kind === 'sugar') {
      let grams = massToGrams(component.amount, component.unit);
      if (grams == null) {
        const volumeGal = volumeToGal(component.amount, component.unit);
        if (volumeGal == null) return { ok: false, message: `${name} needs a weight.` };
        grams = volumeGal * ML_PER_GALLON * SUCROSE_BULK_DENSITY_G_PER_ML;
        warnings.push(`${name} volume was converted to mass with the dry-sugar density ${SUCROSE_BULK_DENSITY_G_PER_ML} g/ml from the blending sheet.`);
      }
      sugarGrams += grams;
      obscured = true;
      continue;
    }

    if (component.kind === 'syrup') {
      let grams = massToGrams(component.amount, component.unit);
      let volumeGal = volumeToGal(component.amount, component.unit);
      if (grams == null && volumeGal == null) {
        return { ok: false, message: `${name} needs a weight or a volume.` };
      }
      if (grams == null && volumeGal != null) {
        grams = volumeGal * ML_PER_GALLON * SYRUP_BULK_DENSITY_G_PER_ML;
      }
      if (volumeGal == null && grams != null) {
        volumeGal = grams / (SYRUP_BULK_DENSITY_G_PER_ML * ML_PER_GALLON);
      }
      extraVolumeGal += volumeGal ?? 0;
      extraWeightLb += (grams ?? 0) / GRAMS_PER_LB;
      const fraction = component.sucroseMassFraction;
      if (fraction != null && fraction > 0 && grams != null) {
        sugarGrams += grams * Math.min(1, fraction);
      } else {
        warnings.push(`${name} has no sucrose fraction, so it adds volume but not sugar g/L.`);
      }
      obscured = true;
      continue;
    }

    const volumeGal = volumeToGal(component.amount, component.unit);
    if (volumeGal == null) {
      warnings.push(`${name} is a weight without a density, so its volume was left out.`);
      obscured = true;
      continue;
    }
    extraVolumeGal += volumeGal;
    if (volumeGal > 0) obscured = true;
  }

  hydro.volumeGal = inputHydroGal;
  return {
    hydro,
    inputHydroGal,
    sugarGrams,
    extraVolumeGal,
    extraWeightLb,
    warnings,
    obscured,
  };
}

function proofForWeightAndAlcohol(weightLb: number, pureAlcoholGal: number): number {
  if (weightLb <= 0 || pureAlcoholGal <= 0) return 0;
  const targetPg = pureAlcoholGal * 2;
  const approximateAbv = Math.min(
    100,
    (pureAlcoholGal / (weightLb / WATER_LBS_PER_US_GALLON)) * 100,
  );
  const hint = proofFromAbv(approximateAbv);
  let bestProof = hint;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let step = 1; step <= 2000; step += 1) {
    const proof = step / 10;
    const pg = proofGallonsFromWeight(weightLb, proof);
    // Proof gallons are rounded to 0.1, so several proofs can tie. Prefer the one nearest the alcohol balance.
    const score = Math.abs(pg - targetPg) + Math.abs(proof - hint) / 1000;
    if (score < bestScore) {
      bestScore = score;
      bestProof = proof;
    }
  }
  return bestProof;
}

function finishAnalysis(prepared: PreparedBlend): FormulationAnalysis {
  const sugarVolumeGal = sucroseApparentVolumeGal(prepared.sugarGrams);
  let hydroWineGal = 0;
  let hydroWeight = prepared.hydro.weightLb;
  if (prepared.hydro.pureAlcoholGal > 0 && hydroWeight > 0) {
    const proof = proofForWeightAndAlcohol(hydroWeight, prepared.hydro.pureAlcoholGal);
    hydroWineGal = wineGallonsFromWeight(hydroWeight, proof);
  } else if (hydroWeight > 0) {
    hydroWineGal = hydroWeight / WATER_LBS_PER_US_GALLON;
  }

  const volumeGal = hydroWineGal + sugarVolumeGal + prepared.extraVolumeGal;
  const liters = volumeGal * LITERS_PER_US_GALLON;
  const pureAlcoholGal = prepared.hydro.pureAlcoholGal;
  const abv = volumeGal > 0 ? (pureAlcoholGal / volumeGal) * 100 : 0;
  const proof = abv > 0 ? proofFromAbv(abv) : 0;
  const sugarGPerL = liters > 0 && prepared.sugarGrams > 0 ? prepared.sugarGrams / liters : null;
  const totalWeightLb = hydroWeight + gramsToLbs(prepared.sugarGrams) + prepared.extraWeightLb;
  const sucroseMassPercent = totalWeightLb > 0 && prepared.sugarGrams > 0
    ? (gramsToLbs(prepared.sugarGrams) / totalWeightLb) * 100
    : null;
  const densityGPerMl = volumeGal > 0 && totalWeightLb > 0
    ? (totalWeightLb * GRAMS_PER_LB) / (volumeGal * ML_PER_GALLON)
    : null;
  const contractionGal = prepared.inputHydroGal - hydroWineGal;
  const obscured = prepared.obscured || prepared.sugarGrams > 0;
  const warnings = [...prepared.warnings];
  if (obscured) {
    warnings.push('Sugar or other dissolved material is in this blend. Do not turn a density reading into proof. Use a lab ABV.');
  }
  if (prepared.sugarGrams > 0) {
    warnings.push('Dissolved sugar volume uses 0.6219 ml/g. It is not an OIML ethanol–water–sucrose table.');
  }

  const model = prepared.sugarGrams > 0 || prepared.extraVolumeGal > 0
    ? 'ttb-table-3-and-sucrose-volume'
    : 'ttb-table-3';

  const summary = volumeGal > 0
    ? `${round2(liters).toFixed(1)} L (${round2(volumeGal).toFixed(2)} gal) at ${round2(abv).toFixed(2)}% ABV`
      + (sugarGPerL != null ? `, ${round2(sugarGPerL).toFixed(1)} g/L sugar` : '')
      + `. ${round2(pureAlcoholGal * LITERS_PER_US_GALLON).toFixed(2)} LAA liters.`
    : 'Nothing to calculate yet.';

  return {
    ok: true,
    volumeGal: round4(volumeGal),
    liters: round4(liters),
    abv: round2(abv),
    proof,
    pureAlcoholGal: round4(pureAlcoholGal),
    laaLiters: round4(laaLitersFromVolumeAbv(volumeGal, abv)),
    weightLb: round2(totalWeightLb),
    sugarGrams: round2(prepared.sugarGrams),
    sugarGPerL: sugarGPerL == null ? null : round2(sugarGPerL),
    sucroseMassPercent: sucroseMassPercent == null ? null : round2(sucroseMassPercent),
    contractionGal: round4(contractionGal),
    densityGPerMl: !obscured && densityGPerMl != null ? round4(densityGPerMl) : densityGPerMl == null ? null : round4(densityGPerMl),
    obscured,
    model,
    warnings,
    summary,
  };
}

/** What these ingredients make, using Table 3 for the unsweetened part. */
export function analyzeFormulation(
  components: FormulationComponent[],
): FormulationAnalysis | FormulationFailure {
  const prepared = prepareBlend(components);
  if ('ok' in prepared && prepared.ok === false) return prepared;
  const blend = prepared as PreparedBlend;
  if (blend.inputHydroGal <= 0 && blend.sugarGrams <= 0 && blend.extraVolumeGal <= 0) {
    return { ok: false, message: 'Enter at least one ingredient with an amount.' };
  }
  return finishAnalysis(blend);
}

function formatAmount(gallons: number): string {
  const liters = gallons * LITERS_PER_US_GALLON;
  return `${round2(gallons).toFixed(2)} gal (${round2(liters).toFixed(1)} L)`;
}

/** Solve spirit, water, and sugar additions for a target volume, ABV, and sugar g/L. */
export function designFormulation(input: DesignInput): FormulationDesign {
  const empty: FormulationDesign = {
    ok: false,
    message: '',
    spiritGal: 0,
    spiritAbv: 0,
    waterGal: 0,
    sugarGrams: 0,
    sugarLbs: 0,
    analysis: null,
  };

  if (!(input.targetVolumeGal > 0) || !(input.targetAbv > 0)) {
    return { ...empty, message: 'Enter a target volume and ABV.' };
  }
  if (abvExceedsLimit(input.targetAbv)) {
    return { ...empty, message: `Target ABV cannot be over ${MAX_ENTERED_ABV}%.` };
  }

  const fixed = input.fixed ?? [];
  const prepared = prepareBlend(fixed);
  if ('ok' in prepared && prepared.ok === false) {
    return { ...empty, message: prepared.message };
  }
  const current = prepared as PreparedBlend;

  const targetLiters = input.targetVolumeGal * LITERS_PER_US_GALLON;
  const targetSugar = input.targetSugarGPerL != null && input.targetSugarGPerL > 0
    ? input.targetSugarGPerL * targetLiters
    : current.sugarGrams;
  const sugarToAdd = targetSugar - current.sugarGrams;
  if (sugarToAdd < -1) {
    return {
      ...empty,
      message: 'This batch already has more sugar than the target. Adding ingredients cannot remove sugar.',
    };
  }

  const sugarAddGrams = Math.max(0, sugarToAdd);
  const finalSugarGal = sucroseApparentVolumeGal(current.sugarGrams + sugarAddGrams);
  const hydroGal = input.targetVolumeGal - finalSugarGal - current.extraVolumeGal;
  if (hydroGal <= 0.001) {
    return {
      ...empty,
      message: 'Sugar and the other ingredients take up more room than the target volume.',
    };
  }

  const targetAlcohol = input.targetVolumeGal * input.targetAbv / 100;
  const alcoholToAdd = targetAlcohol - current.hydro.pureAlcoholGal;
  if (alcoholToAdd < -0.01) {
    return {
      ...empty,
      message: 'This batch already has more alcohol than the target. Adding spirit or water cannot remove alcohol.',
    };
  }

  let spiritAbv = 0;
  let spiritGal = 0;
  let spiritWeight = 0;
  if (alcoholToAdd > 0.001) {
    if (input.additionSpiritAbv == null || input.additionSpiritAbv <= 0) {
      return { ...empty, message: 'Enter the ABV of the spirit you can add.' };
    }
    if (abvExceedsLimit(input.additionSpiritAbv)) {
      return { ...empty, message: `Spirit ABV cannot be over ${MAX_ENTERED_ABV}%.` };
    }
    spiritAbv = abvAt60(input.additionSpiritAbv, input.additionSpiritTemperatureF);
    spiritGal = alcoholToAdd / (spiritAbv / 100);
    spiritWeight = weightFromWineGallons(spiritGal, proofFromAbv(spiritAbv));
  }

  const hydroAbv = (current.hydro.pureAlcoholGal + Math.max(0, alcoholToAdd)) / hydroGal * 100;
  if (hydroAbv > MAX_ENTERED_ABV + 0.05) {
    return {
      ...empty,
      message: `The unsweetened portion would need to be ${round2(hydroAbv).toFixed(1)}% ABV, above ${MAX_ENTERED_ABV}%.`,
    };
  }
  const hydroProof = proofFromAbv(hydroAbv);
  const hydroWeight = hydroAbv > 0
    ? weightFromWineGallons(hydroGal, hydroProof)
    : hydroGal * WATER_LBS_PER_US_GALLON;
  const waterWeight = hydroWeight - current.hydro.weightLb - spiritWeight;
  if (waterWeight < -0.05) {
    const why = spiritGal > 0
      ? `Spirit at ${round2(spiritAbv).toFixed(1)}% ABV is not strong enough to hit this volume and proof together.`
      : 'The batch already weighs more than this volume at the target proof. Additions cannot lighten it.';
    return { ...empty, message: why };
  }

  const waterGal = Math.max(0, waterWeight) / WATER_LBS_PER_US_GALLON;
  const additions: FormulationComponent[] = [];
  if (spiritGal > 0.0001) {
    additions.push({
      kind: 'spirit',
      name: 'Added spirit',
      amount: spiritGal,
      unit: 'gal',
      abv: spiritAbv,
      temperatureF: 60,
    });
  }
  if (waterGal > 0.0001) {
    additions.push({ kind: 'water', name: 'Proofing water', amount: waterGal, unit: 'gal' });
  }
  if (sugarAddGrams > 0.5) {
    additions.push({ kind: 'sugar', name: 'Sugar', amount: sugarAddGrams, unit: 'g' });
  }

  const analysis = analyzeFormulation([...fixed, ...additions]);
  if (!analysis.ok) return { ...empty, message: analysis.message };

  const parts: string[] = [];
  if (spiritGal > 0.0001) parts.push(`${formatAmount(spiritGal)} of ${round2(spiritAbv).toFixed(1)}% spirit`);
  if (waterGal > 0.0001) parts.push(`${formatAmount(waterGal)} of water`);
  if (sugarAddGrams > 0.5) parts.push(`${round2(gramsToLbs(sugarAddGrams)).toFixed(2)} lb of sugar`);
  const action = parts.length > 0 ? `Add ${parts.join(', ')}.` : 'Nothing to add. The batch already matches the target.';
  const targetLitersLabel = round2(targetLiters).toFixed(1);
  const message = `${action} Predicted result is about ${targetLitersLabel} L at ${round2(input.targetAbv).toFixed(2)}% ABV`
    + (input.targetSugarGPerL != null && input.targetSugarGPerL > 0
      ? ` and ${round2(input.targetSugarGPerL).toFixed(1)} g/L sugar.`
      : '.');

  return {
    ok: true,
    message,
    spiritGal: round4(spiritGal),
    spiritAbv: round2(spiritAbv),
    waterGal: round4(waterGal),
    sugarGrams: round2(sugarAddGrams),
    sugarLbs: round3(gramsToLbs(sugarAddGrams)),
    analysis,
  };
}

/**
 * Add spirit, water, and sugar so a measured batch reaches a larger target volume and ABV.
 * If the batch is already bigger than the target, or already too strong, say so.
 */
export function correctBatchToTarget(input: BatchCorrectionInput): FormulationDesign {
  const empty: FormulationDesign = {
    ok: false,
    message: '',
    spiritGal: 0,
    spiritAbv: 0,
    waterGal: 0,
    sugarGrams: 0,
    sugarLbs: 0,
    analysis: null,
  };
  if (!(input.measuredVolumeGal > 0) || !(input.measuredAbv > 0)) {
    return { ...empty, message: 'Enter the measured volume and ABV.' };
  }
  if (abvExceedsLimit(input.measuredAbv) || abvExceedsLimit(input.targetAbv)) {
    return { ...empty, message: `ABV cannot be over ${MAX_ENTERED_ABV}%.` };
  }
  if (input.targetVolumeGal + 0.02 < input.measuredVolumeGal) {
    return {
      ...empty,
      message: 'This batch is already larger than the target volume. Additions cannot make it smaller.',
    };
  }

  const measuredAbv = abvAt60(input.measuredAbv, input.measuredTemperatureF);
  const measuredLiters = input.measuredVolumeGal * LITERS_PER_US_GALLON;
  const sugarGPerL = input.measuredSugarGPerL ?? 0;
  const sugarGrams = sugarGPerL > 0 ? sugarGPerL * measuredLiters : 0;
  const sugarGal = sucroseApparentVolumeGal(sugarGrams);
  const hydroGal = input.measuredVolumeGal - sugarGal;
  if (hydroGal <= 0.001) {
    return { ...empty, message: 'The measured sugar volume is larger than the measured batch.' };
  }
  const hydroAbv = measuredAbv * input.measuredVolumeGal / hydroGal;
  const fixed: FormulationComponent[] = [{
    kind: 'spirit',
    name: 'Measured batch',
    amount: hydroGal,
    unit: 'gal',
    abv: hydroAbv,
    temperatureF: 60,
  }];
  if (sugarGrams > 0) {
    fixed.push({ kind: 'sugar', name: 'Sugar already dissolved', amount: sugarGrams, unit: 'g' });
  }

  return designFormulation({
    targetVolumeGal: input.targetVolumeGal,
    targetAbv: input.targetAbv,
    targetSugarGPerL: input.targetSugarGPerL ?? (sugarGPerL > 0 ? sugarGPerL : 0),
    additionSpiritAbv: input.additionSpiritAbv,
    additionSpiritTemperatureF: input.additionSpiritTemperatureF,
    fixed,
  });
}
