import { TTB_WATER_POUNDS_PER_GALLON_TABLE6, TTB_WATER_WINE_GALLONS_PER_POUND } from './constants';
import { Decimal, dec, roundFixed, snapshotJson } from './decimal';
import { ROUNDING } from './rounding';
import { fail, type EngineFailure } from './results';
import { TABLE6, type Table6Entry } from './table6-data';

export interface Table6Point {
  proof: Decimal;
  alcohol: Decimal;
  water: Decimal;
  sgAir: Decimal;
  sgVacuum: Decimal;
  /** True when the proof is not an integer row and the water and gravity columns were interpolated. */
  interpolated: boolean;
}

export type GravityBasis = 'air' | 'vacuum';

const ROWS: Table6Point[] = TABLE6.map((row) => ({
  proof: dec(row.proof),
  alcohol: dec(row.alcohol),
  water: dec(row.water),
  sgAir: dec(row.sgAir),
  sgVacuum: dec(row.sgVacuum),
  interpolated: false,
}));

/** Water at 0 proof. Not a printed Table 6 row. Specific gravity of water is 1. */
const WATER: Table6Point = {
  proof: dec('0'),
  alcohol: dec('0'),
  water: dec('100'),
  sgAir: dec('1'),
  sgVacuum: dec('1'),
  interpolated: false,
};

function lerp(low: Decimal, high: Decimal, t: Decimal): Decimal {
  return low.plus(high.minus(low).times(t));
}

/** Table 6 row at a proof from 0 through 200. Fractional proofs interpolate water and specific gravity. */
export function table6At(proof: Decimal.Value): Table6Point {
  const p = dec(proof);
  if (p.lt(0) || p.gt(200)) {
    throw new Error('Table 6 covers 0 through 200 proof.');
  }
  if (p.eq(0)) return WATER;
  const upperIndex = ROWS.findIndex((row) => row.proof.gte(p));
  const upper = ROWS[upperIndex];
  if (upper.proof.eq(p)) return upper;
  const lower = upperIndex === 0 ? WATER : ROWS[upperIndex - 1];
  const span = upper.proof.minus(lower.proof);
  const t = p.minus(lower.proof).div(span);
  return {
    proof: p,
    alcohol: p.div(2),
    water: lerp(lower.water, upper.water, t),
    sgAir: lerp(lower.sgAir, upper.sgAir, t),
    sgVacuum: lerp(lower.sgVacuum, upper.sgVacuum, t),
    interpolated: true,
  };
}

export function table6Entry(proof: string): Table6Entry | undefined {
  return TABLE6.find((row) => row.proof === proof);
}

export interface DilutionResult {
  ok: true;
  warnings: string[];
  /** Gallons of water to add to the spirit. */
  waterWineGallons: string;
  /** Finished wine gallons after contraction. Alcohol is conserved. */
  finalWineGallons: string;
  /** Spirit gallons plus water gallons, before contraction. */
  uncontractedWineGallons: string;
  contractionWineGallons: string;
  waterPounds: string;
  fromProof: string;
  toProof: string;
  spiritWineGallons: string;
  snapshot: string;
}

/**
 * Water to add to reduce proof, 27 CFR §30.66.
 * Divide the alcohol in the given strength by the alcohol in the required
 * strength, multiply by the water in the required strength, and subtract the
 * water in the given strength. Scale from 100 gallons to the spirit volume.
 * Finished volume conserves alcohol: gallons × given proof / required proof.
 */
export function diluteWithWater(
  spiritWineGallons: string,
  fromProof: string,
  toProof: string,
): DilutionResult | EngineFailure {
  let spirit: Decimal;
  let from: Decimal;
  let to: Decimal;
  try {
    spirit = dec(spiritWineGallons);
    from = dec(fromProof);
    to = dec(toProof);
  } catch (error) {
    return fail([error instanceof Error ? error.message : 'Invalid decimal'], {
      spiritWineGallons,
      fromProof,
      toProof,
    });
  }

  if (spirit.lt(0) || from.lt(0) || to.lt(0) || from.gt(200) || to.gt(200)) {
    return fail(['Proof must be from 0 to 200, and gallons cannot be negative.'], {
      spiritWineGallons, fromProof, toProof,
    });
  }
  if (to.gt(from)) {
    return fail(['Water cannot raise proof. This is the Table 6 reduction method.'], {
      spiritWineGallons, fromProof, toProof,
    });
  }
  if (spirit.eq(0) || from.eq(to)) {
    const zero = roundFixed('0', ROUNDING.wineGallons);
    const same = roundFixed(spirit, ROUNDING.wineGallons);
    const fields = {
      status: 'calculated',
      spiritWineGallons: same,
      fromProof: roundFixed(from, ROUNDING.proof),
      toProof: roundFixed(to, ROUNDING.proof),
      waterWineGallons: zero,
      finalWineGallons: same,
      uncontractedWineGallons: same,
      contractionWineGallons: zero,
      waterPounds: roundFixed('0', ROUNDING.pounds),
    };
    return { ok: true, warnings: [], ...fields, snapshot: snapshotJson(fields) };
  }
  if (to.eq(0)) {
    return fail(['A zero proof target would require removing all alcohol.'], {
      spiritWineGallons, fromProof, toProof,
    });
  }

  const given = table6At(from);
  const required = table6At(to);
  const waterPerHundred = given.alcohol.div(required.alcohol).times(required.water).minus(given.water);
  if (waterPerHundred.lt(0)) {
    return fail(['Table 6 water parts do not call for water at this pair of proofs.'], {
      spiritWineGallons, fromProof, toProof,
    });
  }
  const water = spirit.times(waterPerHundred).div(100);
  const final = spirit.times(from).div(to);
  const uncontracted = spirit.plus(water);
  const waterPounds = water.div(dec(TTB_WATER_WINE_GALLONS_PER_POUND));
  const warnings: string[] = [];
  if (given.interpolated || required.interpolated) {
    warnings.push('Table 6 is printed at whole proofs. Water and gravity were interpolated.');
  }
  const fields = {
    status: 'calculated',
    spiritWineGallons: roundFixed(spirit, ROUNDING.wineGallons),
    fromProof: roundFixed(from, ROUNDING.proof),
    toProof: roundFixed(to, ROUNDING.proof),
    waterWineGallons: roundFixed(water, ROUNDING.wineGallons),
    finalWineGallons: roundFixed(final, ROUNDING.wineGallons),
    uncontractedWineGallons: roundFixed(uncontracted, ROUNDING.wineGallons),
    contractionWineGallons: roundFixed(uncontracted.minus(final), ROUNDING.wineGallons),
    waterPounds: roundFixed(waterPounds, ROUNDING.pounds),
  };
  return { ok: true, warnings, ...fields, snapshot: snapshotJson(fields) };
}

export interface Table6Gauge {
  ok: true;
  warnings: string[];
  weightPounds: string;
  proof: string;
  specificGravity: string;
  basis: GravityBasis;
  poundsPerWineGallon: string;
  wineGallons: string;
  proofGallons: string;
  gallonsPerPound: string;
  snapshot: string;
}

/**
 * Alternate proof-gallon method in §30.66.
 * Pounds per gallon = 8.32823 × specific gravity, rounded to 5 decimals.
 * Wine gallons = weight / pounds per gallon, rounded to 2 decimals.
 * Proof gallons = wine gallons × proof / 100, rounded to 1 decimal.
 */
export function gaugeWeightByTable6(
  weightPounds: string,
  proof: string,
  basis: GravityBasis = 'air',
): Table6Gauge | EngineFailure {
  let weight: Decimal;
  let p: Decimal;
  try {
    weight = dec(weightPounds);
    p = dec(proof);
  } catch (error) {
    return fail([error instanceof Error ? error.message : 'Invalid decimal'], { weightPounds, proof });
  }
  if (weight.lt(0) || p.lt(0) || p.gt(200)) {
    return fail(['Weight cannot be negative, and proof must be from 0 to 200.'], { weightPounds, proof });
  }
  if (weight.eq(0) || p.eq(0)) {
    const fields = {
      status: 'calculated',
      weightPounds: roundFixed(weight, ROUNDING.pounds),
      proof: roundFixed(p, ROUNDING.proof),
      specificGravity: null,
      basis,
      poundsPerWineGallon: null,
      wineGallons: roundFixed('0', ROUNDING.gaugedWineGallons),
      proofGallons: roundFixed('0', ROUNDING.proofGallons),
      gallonsPerPound: null,
    };
    return {
      ok: true,
      warnings: [],
      weightPounds: fields.weightPounds,
      proof: fields.proof,
      specificGravity: '',
      basis,
      poundsPerWineGallon: '',
      wineGallons: fields.wineGallons,
      proofGallons: fields.proofGallons,
      gallonsPerPound: '',
      snapshot: snapshotJson(fields),
    };
  }
  const row = table6At(p);
  const sg = basis === 'air' ? row.sgAir : row.sgVacuum;
  const poundsPerGallon = dec(TTB_WATER_POUNDS_PER_GALLON_TABLE6).times(sg)
    .toDecimalPlaces(ROUNDING.poundsPerGallon, Decimal.ROUND_HALF_UP);
  const wine = weight.div(poundsPerGallon).toDecimalPlaces(ROUNDING.gaugedWineGallons, Decimal.ROUND_HALF_UP);
  const proofGallons = wine.times(p).div(100).toDecimalPlaces(ROUNDING.proofGallons, Decimal.ROUND_HALF_UP);
  const gallonsPerPound = dec('1').div(poundsPerGallon);
  const warnings: string[] = [];
  if (basis === 'vacuum') {
    warnings.push('Table 6 vacuum specific gravity is still the 60 °F gauging table, not an OIML 20 °C table.');
  }
  if (row.interpolated) {
    warnings.push('Table 6 is printed at whole proofs. Specific gravity was interpolated.');
  }
  const fields = {
    status: 'calculated',
    weightPounds: roundFixed(weight, ROUNDING.pounds),
    proof: roundFixed(p, ROUNDING.proof),
    basis,
    specificGravity: roundFixed(sg, ROUNDING.specificGravity),
    poundsPerWineGallon: poundsPerGallon.toFixed(ROUNDING.poundsPerGallon),
    wineGallons: wine.toFixed(ROUNDING.gaugedWineGallons),
    proofGallons: proofGallons.toFixed(ROUNDING.proofGallons),
    gallonsPerPound: roundFixed(gallonsPerPound, ROUNDING.gallonsPerPound),
  };
  return { ok: true, warnings, ...fields, snapshot: snapshotJson(fields) };
}
