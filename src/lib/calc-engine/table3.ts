import table3Data from '../../services/table3-data.generated.json';
import { Decimal, dec, roundFixed, snapshotJson } from './decimal';
import { ROUNDING } from './rounding';
import { fail, type EngineFailure } from './results';

const PG_AT_100 = table3Data.pgAt100Lb as Record<string, number>;
const EXACT_COLUMNS = table3Data.exactColumns as Record<string, number>;
const LARGE_BLOCKS = ['70000', '60000', '50000', '40000', '30000', '20000', '10000', '9000', '8000', '7000', '6000', '5000', '4000', '3000', '2000', '1000'];

function oneDecimal(value: Decimal): Decimal {
  return value.toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
}

function pgAt100(proof: Decimal): Decimal {
  const key = proof.toFixed(0);
  const raw = PG_AT_100[key];
  if (raw === undefined) return dec('0');
  return dec(raw.toFixed(1));
}

/** Proof gallons for one Table 3 column weight. Integer proofs use the printed column when it was transcribed. */
export function table3ColumnProofGallons(proof: string, columnWeightLb: string): string {
  const p = dec(proof);
  const column = dec(columnWeightLb);
  const roundedProof = p.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const exact = EXACT_COLUMNS[`${roundedProof.toFixed(0)}:${column.toFixed(0)}`];
  if (exact !== undefined && p.eq(roundedProof)) {
    return dec(exact.toFixed(1)).toFixed(1);
  }
  const lower = p.floor();
  const upper = p.ceil();
  const lowerPg = pgAt100(lower).times(column).div(100);
  const upperPg = pgAt100(upper).times(column).div(100);
  const pg = lower.eq(upper)
    ? lowerPg
    : lowerPg.plus(upperPg.minus(lowerPg).times(p.minus(lower)));
  return oneDecimal(pg).toFixed(1);
}

interface WeightPart {
  columnWeightLb: Decimal;
  factor: Decimal;
}

/** Decompose net weight the way 27 CFR §30.63 walks the Table 3 columns. */
export function decomposeWeightLb(weightLb: string): { columnWeightLb: string; factor: string }[] {
  const weight = dec(weightLb);
  if (weight.lte(0)) return [];
  const parts: WeightPart[] = [];
  let remaining = weight.times(2).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).div(2);

  for (const block of LARGE_BLOCKS) {
    const size = dec(block);
    while (remaining.gte(size)) {
      parts.push({ columnWeightLb: size, factor: dec('1') });
      remaining = remaining.minus(size).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
    }
  }

  const whole = remaining.floor();
  const fraction = remaining.minus(whole).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const hundreds = whole.div(100).floor().times(100);
  if (hundreds.gt(0)) parts.push({ columnWeightLb: hundreds, factor: dec('1') });
  const tens = whole.mod(100).div(10).floor().times(10);
  if (tens.gt(0)) parts.push({ columnWeightLb: tens.times(10), factor: dec('0.1') });
  const ones = whole.mod(10);
  if (ones.gt(0)) parts.push({ columnWeightLb: ones.times(100), factor: dec('0.01') });
  if (fraction.gte('0.5')) parts.push({ columnWeightLb: dec('500'), factor: dec('0.001') });

  return parts.map((part) => ({
    columnWeightLb: part.columnWeightLb.toFixed(0),
    factor: part.factor.toFixed(3),
  }));
}

export function proofGallonsFromTable3(weightLb: string, proof: string): string {
  const weight = dec(weightLb);
  const p = dec(proof);
  if (weight.lte(0) || p.lte(0)) return roundFixed('0', ROUNDING.proofGallons);
  const total = decomposeWeightLb(weight.toFixed(3)).reduce((sum, part) => {
    const column = dec(table3ColumnProofGallons(p.toFixed(4), part.columnWeightLb));
    return sum.plus(oneDecimal(column.times(dec(part.factor))));
  }, dec('0'));
  return oneDecimal(total).toFixed(1);
}

export interface Table3Gauge {
  ok: true;
  warnings: string[];
  weightPounds: string;
  proof: string;
  proofGallons: string;
  wineGallons: string;
  snapshot: string;
}

/** Proof gallons and wine gallons from net weight and true proof, Table 3. */
export function gaugeWeightByTable3(weightPounds: string, proof: string): Table3Gauge | EngineFailure {
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
  const proofGallons = proofGallonsFromTable3(weight.toFixed(3), p.toFixed(4));
  const wine = p.eq(0) ? dec('0') : dec(proofGallons).times(100).div(p);
  const fields = {
    status: 'calculated',
    weightPounds: roundFixed(weight, ROUNDING.pounds),
    proof: roundFixed(p, ROUNDING.proof),
    proofGallons,
    wineGallons: roundFixed(wine, ROUNDING.gaugedWineGallons),
  };
  return { ok: true, warnings: [], ...fields, snapshot: snapshotJson(fields) };
}
