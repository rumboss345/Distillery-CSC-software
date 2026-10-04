import {
  LITERS_PER_US_GALLON,
  MAX_ENTERED_ABV,
  SUCROSE_QUICK_ESTIMATE_ML_PER_G,
} from './constants';
import { dec, roundFixed, snapshotJson } from './decimal';
import { fail, type EngineFailure } from './results';
import { LAB_DIFFERENCE_TOLERANCE, ROUNDING } from './rounding';

export type IngredientClass = 'spirit' | 'water' | 'sugar' | 'syrup' | 'flavoring' | 'color' | 'other';

/** One recipe line. Lines are never merged, whatever the count. */
export interface RecipeLine {
  id: string;
  name: string;
  classification: IngredientClass;
  /** Fraction of the finished mass. Not a fraction of the batch volume. */
  massFractionOfFinished: string;
  quantityUom: string;
  densityGPerMl: string | null;
  costPerUom: string | null;
}

export interface ScaledRecipeLine {
  id: string;
  name: string;
  classification: IngredientClass;
  massFractionOfFinished: string;
  quantity: string;
  quantityUom: string;
  densityGPerMl: string | null;
  costUsd: string | null;
}

export interface ScaledRecipe {
  ok: true;
  warnings: string[];
  finishedMass: string;
  lines: ScaledRecipeLine[];
  lineCount: number;
  fractionSum: string;
  totalCostUsd: string;
  snapshot: string;
}

/**
 * Scale every line by the finished mass. The line count on the way out equals
 * the line count on the way in. A report that can show only six lines has to
 * do that later, without changing this result.
 */
export function scaleRecipeByFinishedMass(lines: RecipeLine[], finishedMass: string): ScaledRecipe | EngineFailure {
  let mass;
  try {
    mass = dec(finishedMass);
  } catch (error) {
    return fail([error instanceof Error ? error.message : 'Invalid mass'], { finishedMass });
  }
  if (mass.lt(0)) return fail(['Finished mass cannot be negative.'], { finishedMass });

  const scaled: ScaledRecipeLine[] = [];
  let fractionSum = dec('0');
  let totalCost = dec('0');
  for (const line of lines) {
    let fraction;
    try {
      fraction = dec(line.massFractionOfFinished);
    } catch (error) {
      return fail([`${line.name}: ${error instanceof Error ? error.message : 'Invalid fraction'}`], {
        lineId: line.id,
      });
    }
    if (fraction.lt(0)) return fail([`${line.name} has a negative mass fraction.`], { lineId: line.id });
    fractionSum = fractionSum.plus(fraction);
    const quantity = mass.times(fraction);
    let cost: string | null = null;
    if (line.costPerUom !== null) {
      cost = roundFixed(quantity.times(dec(line.costPerUom)), ROUNDING.costUsd);
      totalCost = totalCost.plus(dec(cost));
    }
    scaled.push({
      id: line.id,
      name: line.name,
      classification: line.classification,
      massFractionOfFinished: roundFixed(fraction, ROUNDING.massQuantity),
      quantity: roundFixed(quantity, ROUNDING.massQuantity),
      quantityUom: line.quantityUom,
      densityGPerMl: line.densityGPerMl,
      costUsd: cost,
    });
  }

  const warnings: string[] = [];
  const sumText = roundFixed(fractionSum, ROUNDING.massQuantity);
  if (!fractionSum.eq(1) && lines.length > 0) {
    warnings.push(`Mass fractions sum to ${sumText}, not 1. Lines were not renormalized or combined.`);
  }
  const finished = roundFixed(mass, ROUNDING.massQuantity);
  const snapshotLines = scaled.map((line) => ({
    id: line.id,
    classification: line.classification,
    massFractionOfFinished: line.massFractionOfFinished,
    quantity: line.quantity,
    quantityUom: line.quantityUom,
    densityGPerMl: line.densityGPerMl,
    costUsd: line.costUsd,
  }));
  return {
    ok: true,
    warnings,
    finishedMass: finished,
    lines: scaled,
    lineCount: scaled.length,
    fractionSum: sumText,
    totalCostUsd: roundFixed(totalCost, ROUNDING.costUsd),
    snapshot: snapshotJson({
      status: 'calculated',
      finishedMass: finished,
      fractionSum: sumText,
      lineCount: String(scaled.length),
      totalCostUsd: roundFixed(totalCost, ROUNDING.costUsd),
      lines: JSON.stringify(snapshotLines),
    }),
  };
}

/** Inventory balance after a delta. Negative on-hand is allowed. */
export function applyInventoryDelta(onHand: string, delta: string): string {
  return roundFixed(dec(onHand).plus(dec(delta)), ROUNDING.inventoryQuantity);
}

export function lineCost(quantity: string, costPerUom: string): string {
  return roundFixed(dec(quantity).times(dec(costPerUom)), ROUNDING.costUsd);
}

export interface EnteredAbv {
  ok: boolean;
  abv: string | null;
  message: string | null;
}

/** Plant entry cap. 99% is allowed. Anything above is refused and is not stored as 99. */
export function enteredAbvAllowed(abv: string): EnteredAbv {
  const value = dec(abv);
  if (value.lt(0)) {
    return { ok: false, abv: null, message: 'Alcohol content cannot be negative.' };
  }
  if (value.gt(MAX_ENTERED_ABV)) {
    return { ok: false, abv: null, message: `Alcohol content cannot be over ${MAX_ENTERED_ABV}%.` };
  }
  return { ok: true, abv: roundFixed(value, ROUNDING.abv), message: null };
}

export interface RecordedProof {
  measuredProof: string | null;
  calculatedCrossCheckProof: string | null;
  /** The proof a batch record may store. Never the cross-check. */
  recordedProof: string | null;
  recordedSource: 'measured-distillation' | 'none';
  note: string;
  snapshot: string;
}

/**
 * Distilled or other lab proof is the recorded proof. A density-plus-sugar
 * figure stays in the cross-check field and cannot become the record.
 */
export function recordMeasuredProof(
  measuredProof: string | null,
  calculatedCrossCheckProof: string | null,
): RecordedProof {
  const measured = measuredProof === null ? null : roundFixed(dec(measuredProof), ROUNDING.proof);
  const crossCheck = calculatedCrossCheckProof === null
    ? null
    : roundFixed(dec(calculatedCrossCheckProof), ROUNDING.proof);
  const recorded = measured;
  const recordedSource: RecordedProof['recordedSource'] = measured !== null ? 'measured-distillation' : 'none';
  const note = measured !== null
    ? 'Recorded proof is the measured distillation result.'
    : 'No measured proof. The density-and-sugar cross-check is not the recorded proof.';
  const fields = {
    status: 'recorded',
    measuredProof: measured,
    calculatedCrossCheckProof: crossCheck,
    recordedProof: recorded,
    recordedSource,
    note,
  };
  return {
    measuredProof: measured,
    calculatedCrossCheckProof: crossCheck,
    recordedProof: recorded,
    recordedSource,
    note,
    snapshot: snapshotJson(fields),
  };
}

/**
 * True when |measured − predicted| / predicted is above 0.5%.
 * Exactly 0.5% is inside the tolerance.
 */
export function labDifferenceExceedsTolerance(predictedProof: string, measuredProof: string): boolean {
  const predicted = dec(predictedProof);
  const measured = dec(measuredProof);
  if (predicted.eq(0)) return !measured.eq(0);
  const relative = measured.minus(predicted).abs().div(predicted.abs());
  return relative.gt(LAB_DIFFERENCE_TOLERANCE);
}

export interface QuickEstimate {
  ok: true;
  label: 'quick-estimate';
  sugarGrams: string;
  volumeWineGallons: string;
  note: string;
  snapshot: string;
}

/**
 * Dissolved-sugar volume from 0.6219 ml/g. Labeled quick estimate only.
 * Not used for proof, proofing water, or a batch record.
 */
export function sucroseQuickEstimateGallons(sugarGrams: string): QuickEstimate | EngineFailure {
  let grams;
  try {
    grams = dec(sugarGrams);
  } catch (error) {
    return fail([error instanceof Error ? error.message : 'Invalid sugar'], { sugarGrams });
  }
  if (grams.lt(0)) return fail(['Sugar cannot be negative.'], { sugarGrams });
  const ml = grams.times(SUCROSE_QUICK_ESTIMATE_ML_PER_G);
  const gallons = ml.div(dec(LITERS_PER_US_GALLON).times(1000));
  const note = 'Quick estimate from 0.6219 ml/g. Not a TTB Tables 1–6 result.';
  const fields = {
    status: 'quick-estimate',
    sugarGrams: roundFixed(grams, ROUNDING.massQuantity),
    volumeWineGallons: roundFixed(gallons, ROUNDING.wineGallons),
    note,
  };
  return {
    ok: true,
    label: 'quick-estimate',
    sugarGrams: fields.sugarGrams,
    volumeWineGallons: fields.volumeWineGallons,
    note,
    snapshot: snapshotJson(fields),
  };
}

/**
 * Sweetened-batch proof and sugar adjustment. Tables 1–6 do not define it.
 * The AlcoDens LQ case (69.03 proof and 242.5 g/L toward 65 proof and 250 g/L,
 * about 109.48 gal and 228.34 g/L) is not calculated.
 */
export function sweetenedBatchAdjustment(): EngineFailure {
  return fail([
    'Adjusting a sweetened batch needs an alcohol-sugar-water model. '
    + 'TTB Tables 1–6 are alcohol-water tables, so this engine does not compute that adjustment. '
    + 'Use Table 6 only for unsweetened proofing water, and record the lab proof from distillation.',
  ], {
    example: '69.03 proof, 242.5 g/L, targets 65 proof and 250 g/L',
  });
}
