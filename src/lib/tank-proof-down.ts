import { decimalStringFromNumber } from './calc-engine/number-bridge';
import { previewProofing } from './calc-engine/proofing';

export interface TankProofDownInput {
  spiritGal: number;
  spiritAbvPercent: number;
  /** Tank capacity. Zero or null means the capacity is not known. */
  capacityGal: number | null;
  tankName?: string;
  /** ABV to bring the tank down to. Used when set. */
  targetAbvPercent?: number | null;
  /** Gallons of water to pour into the tank. Used when no target ABV is set. */
  waterGal?: number | null;
}

export interface TankProofDownPlan {
  ok: boolean;
  message: string | null;
  spiritGal: number;
  spiritAbvPercent: number;
  waterGal: number;
  finishedGal: number;
  finishedAbvPercent: number;
  /** Gauge rise after contraction: finished gallons minus the gallons already in the tank. */
  volumeAddedGal: number;
  contractionGal: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function planBase(input: TankProofDownInput): Omit<TankProofDownPlan, 'ok' | 'message'> {
  return {
    spiritGal: input.spiritGal,
    spiritAbvPercent: input.spiritAbvPercent,
    waterGal: 0,
    finishedGal: input.spiritGal,
    finishedAbvPercent: input.spiritAbvPercent,
    volumeAddedGal: 0,
    contractionGal: 0,
  };
}

function refuse(input: TankProofDownInput, message: string): TankProofDownPlan {
  return { ...planBase(input), ok: false, message };
}

/**
 * Water added to alcohol that stays in the tank.
 * Finished gallons use TTB Table 6 at 60 °F, so contraction is included.
 */
export function planTankProofDown(input: TankProofDownInput): TankProofDownPlan {
  const spiritGal = input.spiritGal;
  const spiritAbv = input.spiritAbvPercent;
  if (!(spiritGal > 0.05)) {
    return refuse(input, 'This tank has no spirit to water down.');
  }
  if (!(spiritAbv > 0.05)) {
    return refuse(input, 'This tank has no alcohol to water down.');
  }

  const target = input.targetAbvPercent;
  const poured = input.waterGal;
  const useTarget = target != null && Number.isFinite(target);
  const useWater = !useTarget && poured != null && Number.isFinite(poured);
  if (!useTarget && !useWater) {
    return refuse(input, 'Enter a lower ABV, or the gallons of water to add.');
  }
  if (useTarget && !(target! > 0)) {
    return refuse(input, 'Enter a target ABV above 0%.');
  }
  if (useTarget && target! >= spiritAbv - 0.01) {
    return refuse(
      input,
      `Target ABV must be lower than the ${spiritAbv.toFixed(1)}% ABV already in the tank.`,
    );
  }
  if (useWater && !(poured! > 0.01)) {
    return refuse(input, 'Enter the gallons of water to add.');
  }

  let result;
  try {
    result = useTarget
      ? previewProofing({
        kind: 'spirit-to-target',
        spiritQuantity: decimalStringFromNumber(spiritGal),
        spiritUnit: 'gal',
        startingAbv: decimalStringFromNumber(spiritAbv),
        targetAbv: decimalStringFromNumber(target!),
        referenceTemperatureF: '60',
      })
      : previewProofing({
        kind: 'spirit-plus-water',
        spiritQuantity: decimalStringFromNumber(spiritGal),
        spiritUnit: 'gal',
        startingAbv: decimalStringFromNumber(spiritAbv),
        waterQuantity: decimalStringFromNumber(poured!),
        waterUnit: 'gal',
        referenceTemperatureF: '60',
      });
  } catch {
    return refuse(input, 'Could not calculate proofing water for this tank.');
  }

  if (!result.ok || !('finishedVolumeGal' in result)) {
    const detail = 'warnings' in result ? result.warnings[0] : '';
    return refuse(input, detail || 'Could not calculate proofing water for this tank.');
  }

  const finishedGal = Number(result.finishedVolumeGal);
  const waterGal = Number(result.waterVolumeGal);
  const contractionGal = Number(result.contractionVolumeGal);
  if (!(finishedGal > spiritGal + 0.001) || !(waterGal > 0.001)) {
    return refuse(input, 'That amount of water does not bring the proof down.');
  }

  const finishedAbv = (spiritGal * spiritAbv) / finishedGal;
  const figured: Omit<TankProofDownPlan, 'ok' | 'message'> = {
    spiritGal: round3(spiritGal),
    spiritAbvPercent: round3(spiritAbv),
    waterGal: round3(waterGal),
    finishedGal: round3(finishedGal),
    finishedAbvPercent: round3(finishedAbv),
    volumeAddedGal: round3(finishedGal - spiritGal),
    contractionGal: round3(Math.max(0, contractionGal)),
  };

  const capacity = input.capacityGal;
  if (capacity != null && capacity > 0 && finishedGal > capacity + 0.05) {
    const name = input.tankName?.trim() || 'This tank';
    return {
      ...figured,
      ok: false,
      message: `${name} holds ${capacity.toFixed(1)} gal. Watering this down finishes at ${finishedGal.toFixed(1)} gal.`,
    };
  }

  return { ...figured, ok: true, message: null };
}
