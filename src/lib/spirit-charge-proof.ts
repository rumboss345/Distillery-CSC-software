import { decimalStringFromNumber } from './calc-engine/number-bridge';
import { previewProofing } from './calc-engine/proofing';
import { chargeExceedsStillCapacity } from './still-charge';

/** Where proofing water is mixed with high-proof tails on a spirit run. */
export type SpiritProofPlace = 'before_still' | 'in_still';

export interface SpiritChargeProofInput {
  /** Gallons of tails drawn from the tank. */
  spiritGal: number;
  spiritAbvPercent: number;
  targetAbvPercent: number;
  stillCapacityGal: number | null;
  /** Room left in the tails tank. Checked only when blending before the still. */
  sourceTankFreeGal: number | null;
  place: SpiritProofPlace;
  stillName?: string;
  tankName?: string;
}

export interface SpiritChargeProofPlan {
  ok: boolean;
  spiritGal: number;
  waterGal: number;
  stillGal: number;
  spiritAbvPercent: number;
  targetAbvPercent: number;
  place: SpiritProofPlace;
  /** Largest tails charge that still fits the still, and the tank when blending first. */
  maxSpiritGal: number | null;
  message: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

interface DilutionGallons {
  spiritGal: number;
  waterGal: number;
  stillGal: number;
}

function diluteGallons(spiritGal: number, spiritAbv: number, targetAbv: number): DilutionGallons | null {
  const result = previewProofing({
    kind: 'spirit-to-target',
    spiritQuantity: decimalStringFromNumber(spiritGal),
    spiritUnit: 'gal',
    startingAbv: decimalStringFromNumber(spiritAbv),
    targetAbv: decimalStringFromNumber(targetAbv),
    referenceTemperatureF: '60',
  });
  if (!result.ok || !('waterVolumeGal' in result)) return null;
  return {
    spiritGal,
    waterGal: Number(result.waterVolumeGal),
    stillGal: Number(result.finishedVolumeGal),
  };
}

function fitsStill(stillGal: number, capacityGal: number | null): boolean {
  return !chargeExceedsStillCapacity(stillGal, capacityGal);
}

function fitsTank(waterGal: number, place: SpiritProofPlace, freeGal: number | null): boolean {
  if (place !== 'before_still') return true;
  if (freeGal == null) return true;
  return waterGal <= freeGal + 0.05;
}

function largestSpiritThatFits(input: {
  spiritAbvPercent: number;
  targetAbvPercent: number;
  stillCapacityGal: number | null;
  sourceTankFreeGal: number | null;
  place: SpiritProofPlace;
  upperGal: number;
}): number | null {
  const upper = input.upperGal;
  if (!(upper > 0)) return null;
  let lo = 0;
  let hi = upper;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const diluted = diluteGallons(mid, input.spiritAbvPercent, input.targetAbvPercent);
    if (
      diluted
      && fitsStill(diluted.stillGal, input.stillCapacityGal)
      && fitsTank(diluted.waterGal, input.place, input.sourceTankFreeGal)
    ) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const stepped = Math.floor(lo * 10) / 10;
  if (!(stepped > 0)) return null;
  const check = diluteGallons(stepped, input.spiritAbvPercent, input.targetAbvPercent);
  if (
    !check
    || !fitsStill(check.stillGal, input.stillCapacityGal)
    || !fitsTank(check.waterGal, input.place, input.sourceTankFreeGal)
  ) {
    return null;
  }
  return stepped;
}

/**
 * Water to bring a spirit-run charge down to a target ABV, without exceeding
 * the still. Blending before the still also needs room in the tails tank.
 */
export function planSpiritChargeProof(input: SpiritChargeProofInput): SpiritChargeProofPlan {
  const place = input.place;
  const base = {
    spiritGal: input.spiritGal,
    waterGal: 0,
    stillGal: input.spiritGal,
    spiritAbvPercent: input.spiritAbvPercent,
    targetAbvPercent: input.targetAbvPercent,
    place,
    maxSpiritGal: null as number | null,
  };
  const stillName = input.stillName?.trim() || 'The still';
  const tankName = input.tankName?.trim() || 'The tails tank';

  if (!(input.spiritGal > 0)) {
    return { ...base, ok: false, message: 'Enter how many gallons of tails to charge.' };
  }
  if (!(input.spiritAbvPercent > 0)) {
    return { ...base, ok: false, message: 'Enter the tails ABV before proofing.' };
  }
  if (!(input.targetAbvPercent > 0) || input.targetAbvPercent >= input.spiritAbvPercent) {
    return {
      ...base,
      ok: false,
      message: `Target ABV must be lower than the tails (${input.spiritAbvPercent.toFixed(1)}% ABV). Water only brings the proof down.`,
    };
  }

  const diluted = diluteGallons(input.spiritGal, input.spiritAbvPercent, input.targetAbvPercent);
  if (!diluted) {
    return { ...base, ok: false, message: 'Could not calculate proofing water for this charge.' };
  }

  const upper = input.stillCapacityGal && input.stillCapacityGal > 0
    ? input.stillCapacityGal
    : input.spiritGal;
  const maxSpiritGal = largestSpiritThatFits({
    spiritAbvPercent: input.spiritAbvPercent,
    targetAbvPercent: input.targetAbvPercent,
    stillCapacityGal: input.stillCapacityGal,
    sourceTankFreeGal: input.sourceTankFreeGal,
    place,
    upperGal: Math.max(upper, input.spiritGal),
  });

  const stillOk = fitsStill(diluted.stillGal, input.stillCapacityGal);
  const tankOk = fitsTank(diluted.waterGal, place, input.sourceTankFreeGal);
  const plan = {
    ...base,
    spiritGal: round1(diluted.spiritGal),
    waterGal: round1(diluted.waterGal),
    stillGal: round1(diluted.stillGal),
    maxSpiritGal,
  };

  if (!stillOk) {
    const cap = input.stillCapacityGal ?? 0;
    const maxNote = maxSpiritGal != null
      ? ` Charge at most ${maxSpiritGal.toFixed(1)} gal of tails.`
      : '';
    return {
      ...plan,
      ok: false,
      message: `${stillName} holds ${cap.toFixed(1)} gal. Proofing ${input.spiritGal.toFixed(1)} gal of tails from ${input.spiritAbvPercent.toFixed(1)}% to ${input.targetAbvPercent.toFixed(1)}% ABV makes ${plan.stillGal.toFixed(1)} gal in the still.${maxNote}`,
    };
  }

  if (!tankOk) {
    const free = input.sourceTankFreeGal ?? 0;
    const maxNote = maxSpiritGal != null
      ? ` Charge at most ${maxSpiritGal.toFixed(1)} gal of tails, or blend the water in the still.`
      : ' Blend the water in the still instead.';
    return {
      ...plan,
      ok: false,
      message: `${tankName} only has ${free.toFixed(1)} gal free, and blending these tails before the still needs ${plan.waterGal.toFixed(1)} gal of water.${maxNote}`,
    };
  }

  const where = place === 'before_still'
    ? 'before they go in the still'
    : 'in the still';
  const capNote = input.stillCapacityGal && input.stillCapacityGal > 0
    ? ` ${stillName} holds ${input.stillCapacityGal.toFixed(1)} gal.`
    : '';
  return {
    ...plan,
    ok: true,
    message: `Add ${plan.waterGal.toFixed(1)} gal of water ${where}. The still charge is ${plan.stillGal.toFixed(1)} gal at ${input.targetAbvPercent.toFixed(1)}% ABV.${capNote}`,
  };
}

export function spiritChargeDetail(run: {
  charge_volume_gal: number;
  charge_abv: number | null;
  proof_water_gal?: number | null;
  proof_spirit_gal?: number | null;
  proof_spirit_abv?: number | null;
  proof_place?: string | null;
}): string | null {
  const water = run.proof_water_gal ?? 0;
  const spirit = run.proof_spirit_gal;
  if (!(water > 0) || spirit == null) return null;
  const where = run.proof_place === 'before_still' ? 'blended before the still' : 'blended in the still';
  const tailsAbv = run.proof_spirit_abv != null ? ` @ ${run.proof_spirit_abv.toFixed(1)}%` : '';
  return `${spirit.toFixed(1)} gal tails${tailsAbv} + ${water.toFixed(1)} gal water, ${where}`;
}
