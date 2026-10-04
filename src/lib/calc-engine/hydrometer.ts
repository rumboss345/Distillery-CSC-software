import { TABLE1_MAX_F, TABLE1_MIN_F, TTB_STANDARD_TEMP_F } from './constants';
import { Decimal, dec, roundFixed, snapshotJson } from './decimal';
import { fail, type EngineFailure } from './results';
import { ROUNDING } from './rounding';

/**
 * Slope of true proof versus sample temperature, in proof per °F.
 * This is the straight line already used in src/services/temperature-correction.ts
 * and checked there against three published Table 1 examples:
 * 80.32 proof at 68.36 °F, 192.82 proof at 72.15 °F, and 193 proof at 75 °F.
 * It is not a transcription of TTB Table 1. Results away from 60 °F carry that warning.
 */
function proofChangePerDegreeF(observedProof: Decimal): Decimal {
  return dec('-0.6').plus(dec('0.001875').times(observedProof));
}

export interface HydrometerResult {
  ok: true;
  warnings: string[];
  /** Hydrometer indication after the optional calibration offset, at the sample temperature. */
  measuredApparentProof: string;
  /** Table 1-style value at 60 °F. With dissolved solids this is still an apparent proof. */
  apparentProofAt60F: string;
  /**
   * True proof. Null when sugar is present: Tables 1–6 do not convert apparent
   * proof plus sugar into true proof. Distillation is the recorded proof.
   */
  trueProof: string | null;
  sugarGPerL: string;
  temperatureF: string;
  snapshot: string;
}

/**
 * Proof hydrometer at the TTB 60 °F basis.
 * `apparentProof` is the hydrometer indication.
 * A calibration offset is added to the indication before the temperature step.
 * Sugar above zero blocks a true-proof result. 150 g/L at an indication of 10
 * is the published AlcoDens LQ case (they print 94.62). That figure is not
 * computed here.
 */
export function correctProofHydrometer(input: {
  apparentProof: string;
  temperatureF: string;
  calibrationOffsetProof?: string;
  sugarGPerL?: string;
}): HydrometerResult | EngineFailure {
  let indication: Decimal;
  let temperature: Decimal;
  let offset: Decimal;
  let sugar: Decimal;
  try {
    indication = dec(input.apparentProof);
    temperature = dec(input.temperatureF);
    offset = dec(input.calibrationOffsetProof ?? '0');
    sugar = dec(input.sugarGPerL ?? '0');
  } catch (error) {
    return fail([error instanceof Error ? error.message : 'Invalid decimal'], {
      apparentProof: input.apparentProof,
      temperatureF: input.temperatureF,
    });
  }

  if (temperature.lt(TABLE1_MIN_F) || temperature.gt(TABLE1_MAX_F)) {
    return fail([
      `Table 1 covers ${TABLE1_MIN_F} through ${TABLE1_MAX_F} °F. ${temperature.toFixed()} °F is outside that table.`,
    ], {
      apparentProof: input.apparentProof,
      temperatureF: input.temperatureF,
    });
  }
  if (sugar.lt(0)) {
    return fail(['Sugar cannot be negative.'], { sugarGPerL: input.sugarGPerL ?? '0' });
  }

  const measured = indication.plus(offset);
  const atStandard = temperature.minus(TTB_STANDARD_TEMP_F).abs().lte('0.05');
  const corrected = atStandard
    ? measured
    : measured.plus(temperature.minus(TTB_STANDARD_TEMP_F).times(proofChangePerDegreeF(measured)));
  const bounded = Decimal.max(corrected, 0);
  const apparentAt60 = roundFixed(bounded, ROUNDING.table1Proof);
  const warnings: string[] = [];
  if (!atStandard) {
    warnings.push(
      'Temperature step uses a slope fitted to three published Table 1 examples, not the full Table 1 grid.',
    );
  }
  const sweetened = sugar.gt(0);
  if (sweetened) {
    warnings.push(
      'Dissolved solids are present. 27 CFR §30.31: a Table 1 correction of this hydrometer is an apparent proof, not true proof. TTB Tables 1–6 do not calculate true proof from sugar. Record the proof from distillation.',
    );
  }
  const trueProof = sweetened ? null : apparentAt60;
  const fields = {
    status: sweetened ? 'apparent-only' : 'calculated',
    measuredApparentProof: roundFixed(measured, ROUNDING.table1Proof),
    apparentProofAt60F: apparentAt60,
    trueProof,
    sugarGPerL: roundFixed(sugar, ROUNDING.sugarGPerL),
    temperatureF: roundFixed(temperature, ROUNDING.temperatureF),
    basis: 'ttb-60f',
  };
  return {
    ok: true,
    warnings,
    measuredApparentProof: fields.measuredApparentProof,
    apparentProofAt60F: apparentAt60,
    trueProof,
    sugarGPerL: fields.sugarGPerL,
    temperatureF: fields.temperatureF,
    snapshot: snapshotJson(fields),
  };
}
