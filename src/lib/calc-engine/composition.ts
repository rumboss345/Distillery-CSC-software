import { dec, roundFixed, snapshotJson } from './decimal';
import { fail, type EngineFailure } from './results';
import { ROUNDING } from './rounding';
import { table6At, type GravityBasis } from './table6';

export interface CompositionResult {
  ok: true;
  warnings: string[];
  proof: string;
  abv: string;
  massPercentAlcohol: string;
  specificGravity: string;
  basis: GravityBasis;
  /** Always null. Density plus sugar is not a TTB Tables 1–6 proof. */
  densitySugarCrossCheckProof: null;
  snapshot: string;
}

/**
 * Alcohol-water composition from Table 6.
 * Mass percent uses the 200-proof specific gravity as the absolute-alcohol
 * weight on the same air or vacuum basis:
 * mass % = (proof / 2) × SG(200) / SG(proof).
 */
export function compositionFromProof(proof: string, basis: GravityBasis = 'air'): CompositionResult | EngineFailure {
  let p;
  try {
    p = dec(proof);
  } catch (error) {
    return fail([error instanceof Error ? error.message : 'Invalid decimal'], { proof });
  }
  if (p.lt(0) || p.gt(200)) {
    return fail(['Proof must be from 0 to 200.'], { proof });
  }
  const row = table6At(p);
  const sg = basis === 'air' ? row.sgAir : row.sgVacuum;
  const alcoholSg = basis === 'air' ? table6At('200').sgAir : table6At('200').sgVacuum;
  const massPercent = sg.eq(0) ? dec('0') : p.div(2).times(alcoholSg).div(sg);
  const warnings: string[] = [];
  if (basis === 'vacuum') {
    warnings.push('Vacuum specific gravity is the Table 6 60 °F column, not OIML at 20 °C.');
  }
  const fields = {
    status: 'calculated',
    proof: roundFixed(p, ROUNDING.proof),
    abv: roundFixed(p.div(2), ROUNDING.abv),
    massPercentAlcohol: roundFixed(massPercent, ROUNDING.massPercent),
    specificGravity: roundFixed(sg, ROUNDING.specificGravity),
    basis,
    densitySugarCrossCheckProof: null,
  };
  return { ok: true, warnings, ...fields, snapshot: snapshotJson(fields) };
}

/**
 * Proof from a measured specific gravity of an alcohol-water mixture.
 * A sugar mass percent above zero is refused. SG 1.01679 with 10 mass % sugar
 * is an AlcoDens LQ example (they print 35.54 proof). Tables 1–6 are
 * alcohol-water tables and that specific gravity is above every spirit row.
 */
export function proofFromSpecificGravity(
  specificGravity: string,
  basis: GravityBasis = 'air',
  sugarMassPercent = '0',
): CompositionResult | EngineFailure {
  let sg;
  let sugar;
  try {
    sg = dec(specificGravity);
    sugar = dec(sugarMassPercent);
  } catch (error) {
    return fail([error instanceof Error ? error.message : 'Invalid decimal'], {
      specificGravity,
      sugarMassPercent,
    });
  }
  if (sugar.lt(0)) return fail(['Sugar mass percent cannot be negative.'], { sugarMassPercent });
  if (sugar.gt(0)) {
    return fail([
      'TTB Tables 1–6 do not give proof from specific gravity plus sugar. '
      + 'A density-and-sugar figure is a cross-check only, and this engine does not invent one. '
      + 'Record the proof from distillation.',
    ], {
      specificGravity,
      sugarMassPercent,
      densitySugarCrossCheckProof: null,
    });
  }
  const low = table6At('200');
  const high = table6At('0');
  const lowSg = basis === 'air' ? low.sgAir : low.sgVacuum;
  const highSg = basis === 'air' ? high.sgAir : high.sgVacuum;
  if (sg.gt(highSg) || sg.lt(lowSg)) {
    return fail([
      `Specific gravity ${sg.toFixed()} is outside Table 6 on the ${basis} basis `
      + `(${lowSg.toFixed(5)} at 200 proof through ${highSg.toFixed(5)} for water).`,
    ], { specificGravity, basis });
  }

  let lo = dec('0');
  let hi = dec('200');
  for (let i = 0; i < 60; i += 1) {
    const mid = lo.plus(hi).div(2);
    const row = table6At(mid);
    const midSg = basis === 'air' ? row.sgAir : row.sgVacuum;
    if (midSg.gt(sg)) lo = mid;
    else hi = mid;
  }
  return compositionFromProof(hi.toFixed(8), basis);
}
