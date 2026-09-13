import {
  formatCorrectionWithAlternate,
  formatSpiritCorrectionWithAlternate,
  ingredientVolumeGal,
  toLbs,
} from './blending';
import type { BlendIngredientType } from '../types';

export interface SpiritSourceInput {
  volumeGal: number;
  abv: number;
  label?: string;
}

export interface AdditiveInput {
  ingredientType: BlendIngredientType;
  name: string;
  amount: number;
  unit: string;
  /** Optional dissolved solids contribution (°Bx per gallon equivalent). */
  brixPerGal?: number;
  costPerUnit?: number;
  lotNumber?: string;
  inventoryItemId?: number | null;
}

export interface MeasurementSet {
  volumeGal: number | null;
  abv: number | null;
  density: number | null;
  brix: number | null;
}

export interface TheoreticalBlendResult {
  volumeGal: number;
  abv: number;
  pureAlcoholGal: number;
  brix: number | null;
  density: number | null;
  hasSugarOrFlavor: boolean;
  densityFromAbvUnreliable: boolean;
}

export interface ReconciliationResult {
  theoretical: MeasurementSet;
  actual: MeasurementSet;
  effective: MeasurementSet;
  effectiveSource: 'lab' | 'theoretical';
  deltas: MeasurementSet;
  warnings: string[];
}

export interface CorrectionSuggestion {
  field: 'water' | 'spirit' | 'sugar';
  direction: 'add' | 'reduce';
  message: string;
}

export interface BatchCorrectionAction {
  ingredientType: 'water' | 'spirit' | 'sugar';
  amount: number;
  unit: string;
  label: string;
  /** Plain-language instruction for production staff. */
  instruction: string;
  projectedAbv: number | null;
  projectedBrix: number | null;
}

export interface BatchCorrectionResult {
  measuredAbv: number;
  targetAbv: number;
  volumeGal: number;
  onTarget: boolean;
  actions: BatchCorrectionAction[];
  headline: string;
  detail: string;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

function hasDissolvedSolids(additives: AdditiveInput[]): boolean {
  return additives.some((a) =>
    a.amount > 0 && ['sugar', 'syrup', 'flavoring', 'color', 'other'].includes(a.ingredientType),
  );
}

function additiveBrixContribution(additive: AdditiveInput, totalVolumeGal: number): number {
  if (additive.amount <= 0 || totalVolumeGal <= 0) return 0;
  if (additive.brixPerGal != null) {
    return (additive.brixPerGal * ingredientVolumeGal({ ...additive, ingredient_type: additive.ingredientType })) / totalVolumeGal;
  }
  if (additive.ingredientType === 'sugar') {
    const lbs = toLbs(additive.amount, additive.unit);
    if (lbs <= 0) return 0;
    // Approximate: 1 lb sucrose ~ 0.12 gal volume; ~10 °Bx per lb in 10 gal batch scale factor
    return (lbs * 10) / totalVolumeGal;
  }
  return 0;
}

/** Pure theoretical blend — never touches inventory. */
export function computeTheoreticalBlend(
  spirits: SpiritSourceInput[],
  additives: AdditiveInput[],
): TheoreticalBlendResult {
  const spiritVolume = spirits.reduce((s, sp) => s + Math.max(0, sp.volumeGal), 0);
  const pureAlcoholGal = spirits.reduce(
    (s, sp) => s + Math.max(0, sp.volumeGal) * Math.max(0, sp.abv) / 100,
    0,
  );
  const additiveVolume = additives.reduce(
    (s, a) => s + ingredientVolumeGal({ ...a, ingredient_type: a.ingredientType }),
    0,
  );
  const volumeGal = spiritVolume + additiveVolume;
  const abv = volumeGal > 0 ? (pureAlcoholGal / volumeGal) * 100 : 0;
  const sugarOrFlavor = hasDissolvedSolids(additives);
  const brixParts = additives.map((a) => additiveBrixContribution(a, volumeGal));
  const brix = volumeGal > 0 && brixParts.some((b) => b > 0)
    ? round2(brixParts.reduce((s, b) => s + b, 0))
    : null;
  const density = !sugarOrFlavor && abv > 0
    ? round3(0.79 + abv * 0.0011)
    : null;

  return {
    volumeGal: round3(volumeGal),
    abv: round2(abv),
    pureAlcoholGal: round3(pureAlcoholGal),
    brix,
    density,
    hasSugarOrFlavor: sugarOrFlavor,
    densityFromAbvUnreliable: sugarOrFlavor,
  };
}

/** Solve dilution water (gal) to hit target ABV. */
export function solveWaterForTargetAbv(
  spirits: SpiritSourceInput[],
  additives: AdditiveInput[],
  targetAbv: number,
): { waterGal: number; result: TheoreticalBlendResult } | null {
  if (targetAbv <= 0) return null;
  const nonWater = additives.filter((a) => a.ingredientType !== 'water');
  const pureAlcohol = spirits.reduce((s, sp) => s + sp.volumeGal * sp.abv / 100, 0);
  const fixedVolume = spirits.reduce((s, sp) => s + sp.volumeGal, 0)
    + nonWater.reduce((s, a) => s + ingredientVolumeGal({ ...a, ingredient_type: a.ingredientType }), 0);
  if (pureAlcohol <= 0) return null;

  const totalVolumeNeeded = pureAlcohol / (targetAbv / 100);
  const waterGal = Math.max(0, totalVolumeNeeded - fixedVolume);
  const waterAdditive: AdditiveInput = {
    ingredientType: 'water',
    name: 'Proofing water (calculated)',
    amount: round3(waterGal),
    unit: 'gal',
  };
  const result = computeTheoreticalBlend(spirits, [...nonWater, waterAdditive]);
  return { waterGal: round3(waterGal), result };
}

/** Solve sugar (lbs) to approach target Brix — approximate for formulation trials. */
export function solveSugarForTargetBrix(
  spirits: SpiritSourceInput[],
  additives: AdditiveInput[],
  targetBrix: number,
): { sugarLbs: number; result: TheoreticalBlendResult } | null {
  if (targetBrix <= 0) return null;
  const base = computeTheoreticalBlend(spirits, additives.filter((a) => a.ingredientType !== 'sugar'));
  if (base.volumeGal <= 0) return null;
  const currentBrix = base.brix ?? 0;
  const deltaBrix = targetBrix - currentBrix;
  if (deltaBrix <= 0) return { sugarLbs: 0, result: base };
  const sugarLbs = round3((deltaBrix * base.volumeGal) / 10);
  const sugarAdditive: AdditiveInput = {
    ingredientType: 'sugar',
    name: 'Sugar (calculated)',
    amount: sugarLbs,
    unit: 'lbs',
  };
  const result = computeTheoreticalBlend(
    spirits,
    [...additives.filter((a) => a.ingredientType !== 'sugar'), sugarAdditive],
  );
  return { sugarLbs, result };
}

export function scaleFormulation(
  spirits: SpiritSourceInput[],
  additives: AdditiveInput[],
  scaleFactor: number,
): { spirits: SpiritSourceInput[]; additives: AdditiveInput[] } {
  const factor = Math.max(0, scaleFactor);
  return {
    spirits: spirits.map((s) => ({ ...s, volumeGal: round3(s.volumeGal * factor) })),
    additives: additives.map((a) => ({ ...a, amount: round3(a.amount * factor) })),
  };
}

export function reconcileMeasurements(
  theoretical: MeasurementSet,
  actual: Partial<MeasurementSet>,
): ReconciliationResult {
  const warnings: string[] = [];
  const labVolume = actual.volumeGal ?? null;
  const labAbv = actual.abv ?? null;
  const labDensity = actual.density ?? null;
  const labBrix = actual.brix ?? null;

  const useLab = labAbv != null || labVolume != null || labBrix != null || labDensity != null;
  if (labAbv != null && labBrix != null && labBrix > 2) {
    warnings.push('Lab ABV is authoritative — density-from-ABV is not used for sugared spirits.');
  }

  const effective: MeasurementSet = {
    volumeGal: labVolume ?? theoretical.volumeGal,
    abv: labAbv ?? theoretical.abv,
    density: labDensity ?? theoretical.density,
    brix: labBrix ?? theoretical.brix,
  };

  const deltas: MeasurementSet = {
    volumeGal: effective.volumeGal != null && theoretical.volumeGal != null
      ? round3(effective.volumeGal - theoretical.volumeGal) : null,
    abv: effective.abv != null && theoretical.abv != null
      ? round2(effective.abv - theoretical.abv) : null,
    density: effective.density != null && theoretical.density != null
      ? round3(effective.density - theoretical.density) : null,
    brix: effective.brix != null && theoretical.brix != null
      ? round2(effective.brix - theoretical.brix) : null,
  };

  return {
    theoretical,
    actual: {
      volumeGal: labVolume,
      abv: labAbv,
      density: labDensity,
      brix: labBrix,
    },
    effective,
    effectiveSource: useLab ? 'lab' : 'theoretical',
    deltas,
    warnings,
  };
}

const ABV_TOLERANCE = 0.2;

/**
 * Calculate exact adjustment amounts to move a measured batch toward target proof.
 * Example: 41.2% measured vs 40% target → "Add 1.2 gal proofing water."
 */
export function computeBatchCorrection(
  volumeGal: number,
  measuredAbv: number,
  targetAbv: number,
  options?: {
    measuredBrix?: number | null;
    targetBrix?: number | null;
    /** Proof of spirit used when batch is under target ABV. Defaults to 80%. */
    spiritProofAbv?: number;
  },
): BatchCorrectionResult | null {
  if (volumeGal <= 0 || measuredAbv <= 0 || targetAbv <= 0) return null;

  const spiritProof = options?.spiritProofAbv ?? 80;
  const pureAlcohol = volumeGal * measuredAbv / 100;
  const actions: BatchCorrectionAction[] = [];
  let workingVolume = volumeGal;
  let workingAbv = measuredAbv;
  let workingBrix = options?.measuredBrix ?? null;

  const abvDelta = measuredAbv - targetAbv;

  if (Math.abs(abvDelta) <= ABV_TOLERANCE) {
    // ABV on target — check Brix if provided
  } else if (abvDelta > ABV_TOLERANCE) {
    const targetVolume = pureAlcohol / (targetAbv / 100);
    const waterGal = round3(Math.max(0, targetVolume - volumeGal));
    if (waterGal > 0.001) {
      workingVolume = volumeGal + waterGal;
      workingAbv = targetAbv;
      actions.push({
        ingredientType: 'water',
        amount: waterGal,
        unit: 'gal',
        label: 'Proofing water',
        instruction: formatCorrectionWithAlternate(
          waterGal,
          'gal',
          'water',
          `Add ${waterGal.toFixed(2)} gallons of proofing water to bring ABV from ${measuredAbv.toFixed(1)}% down to ${targetAbv.toFixed(1)}%.`,
        ),
        projectedAbv: round2(targetAbv),
        projectedBrix: workingBrix,
      });
    }
  } else {
    const pureNeeded = volumeGal * targetAbv / 100 - pureAlcohol;
    const denom = spiritProof / 100 - targetAbv / 100;
    if (denom > 0.001 && pureNeeded > 0) {
      const spiritGal = round3(pureNeeded / denom);
      const newPure = pureAlcohol + spiritGal * spiritProof / 100;
      workingVolume = volumeGal + spiritGal;
      workingAbv = round2((newPure / workingVolume) * 100);
      actions.push({
        ingredientType: 'spirit',
        amount: spiritGal,
        unit: 'gal',
        label: `High-proof spirit (${spiritProof}% ABV)`,
        instruction: formatSpiritCorrectionWithAlternate(
          spiritGal,
          spiritProof,
          `Add ${spiritGal.toFixed(2)} gallons of ${spiritProof}% spirit to raise ABV from ${measuredAbv.toFixed(1)}% up to about ${workingAbv.toFixed(1)}%.`,
        ),
        projectedAbv: workingAbv,
        projectedBrix: workingBrix,
      });
    }
  }

  const targetBrix = options?.targetBrix;
  const measuredBrix = options?.measuredBrix;
  if (targetBrix != null && measuredBrix != null && measuredBrix < targetBrix - 0.5) {
    const deltaBrix = targetBrix - measuredBrix;
    const sugarLbs = round3((deltaBrix * workingVolume) / 10);
    if (sugarLbs > 0.001) {
      workingBrix = round2(targetBrix);
      actions.push({
        ingredientType: 'sugar',
        amount: sugarLbs,
        unit: 'lbs',
        label: 'Sugar',
        instruction: formatCorrectionWithAlternate(
          sugarLbs,
          'lbs',
          'sugar',
          `Add ${sugarLbs.toFixed(2)} lbs of sugar to raise sweetness from ${measuredBrix.toFixed(1)}° to about ${targetBrix.toFixed(1)}° Brix.`,
        ),
        projectedAbv: workingAbv,
        projectedBrix: workingBrix,
      });
    }
  }

  const onTarget = actions.length === 0;
  const headline = onTarget
    ? `This batch is on target at ${measuredAbv.toFixed(1)}% ABV.`
    : actions.length === 1
      ? actions[0].instruction
      : `${actions.length} adjustments needed to hit your targets.`;

  const detail = onTarget
    ? 'No changes required — proceed to approval or bottling.'
    : 'Make these adjustments, mix thoroughly, and re-test before approving.';

  return {
    measuredAbv,
    targetAbv,
    volumeGal,
    onTarget,
    actions,
    headline,
    detail,
  };
}

export function suggestCorrections(
  theoretical: TheoreticalBlendResult,
  actual: Partial<MeasurementSet>,
  targetAbv?: number | null,
  targetBrix?: number | null,
): CorrectionSuggestion[] {
  const suggestions: CorrectionSuggestion[] = [];
  const labAbv = actual.abv;
  const labBrix = actual.brix;

  if (targetAbv != null && labAbv != null && labAbv > targetAbv + 0.2) {
    suggestions.push({
      field: 'water',
      direction: 'add',
      message: `Lab ABV ${labAbv.toFixed(1)}% is above target ${targetAbv}% — add proofing water and re-trial.`,
    });
  }
  if (targetAbv != null && labAbv != null && labAbv < targetAbv - 0.2) {
    suggestions.push({
      field: 'spirit',
      direction: 'add',
      message: `Lab ABV ${labAbv.toFixed(1)}% is below target ${targetAbv}% — increase spirit charge or reduce water.`,
    });
  }
  if (targetBrix != null && labBrix != null && labBrix < targetBrix - 0.5) {
    suggestions.push({
      field: 'sugar',
      direction: 'add',
      message: `Lab Brix ${labBrix.toFixed(1)}° is below target ${targetBrix}° — add sugar/syrup.`,
    });
  }
  if (theoretical.densityFromAbvUnreliable && actual.density != null && actual.abv == null) {
    suggestions.push({
      field: 'water',
      direction: 'add',
      message: 'Enter lab ABV for sugared/flavored products — do not rely on density-derived proof.',
    });
  }
  return suggestions;
}

export function totalIngredientCost(additives: AdditiveInput[]): number {
  return round2(
    additives.reduce((s, a) => s + (a.costPerUnit ?? 0) * a.amount, 0),
  );
}
