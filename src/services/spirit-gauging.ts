import table3Data from './table3-data.generated.json';

/** US wine gallons per liter at 60 °F (TTB gauging basis). */
export const LITERS_PER_US_GALLON = 3.785411784;
export const LB_PER_KG = 2.2046226218;

const PG_AT_100 = table3Data.pgAt100Lb as Record<string, number>;
const EXACT_COLUMNS = table3Data.exactColumns as Record<string, number>;
const LARGE_BLOCKS = [70000, 60000, 50000, 40000, 30000, 20000, 10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000] as const;

export interface SpiritGaugingResult {
  proof: number;
  abv: number;
  weightLb: number;
  weightKg: number;
  proofGallons: number;
  wineGallons: number;
  liters: number;
  lbPerUsGallon: number;
  kgPerLiter: number;
}

export interface WeighingWorkflowResult extends SpiritGaugingResult {
  grossWeightLb: number;
  tareWeightLb: number;
  netWeightLb: number;
}

function roundTtbProofGallons(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function roundDisplay(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function proofFromAbv(abv: number): number {
  return roundDisplay(abv * 2, 1);
}

export function abvFromProof(proof: number): number {
  return roundDisplay(proof / 2, 2);
}

function normalizeProof(proof: number): number {
  if (proof < 0) return 0;
  if (proof > 200) return 200;
  return proof;
}

/** Proof gallons for a standard Table 3 column weight at the given proof. */
export function table3ColumnProofGallons(proof: number, columnWeightLb: number): number {
  const key = `${Math.round(proof)}:${columnWeightLb}`;
  if (EXACT_COLUMNS[key] !== undefined) {
    return EXACT_COLUMNS[key];
  }

  const fractionalProof = normalizeProof(proof);
  const lower = Math.floor(fractionalProof);
  const upper = Math.ceil(fractionalProof);
  const lowerPg = (PG_AT_100[String(lower)] ?? 0) * columnWeightLb / 100;
  const upperPg = (PG_AT_100[String(upper)] ?? lowerPg) * columnWeightLb / 100;
  const pg = lower === upper
    ? lowerPg
    : lowerPg + (upperPg - lowerPg) * (fractionalProof - lower);
  return roundTtbProofGallons(pg);
}

interface WeightComponent {
  columnWeightLb: number;
  factor: number;
}

/**
 * Decompose net weight into Table 3 column lookups per 27 CFR §30.63.
 * Supports half-pound increments via the 500 lb column × 0.001.
 */
export function decomposeWeightLb(weightLb: number): WeightComponent[] {
  if (weightLb <= 0) return [];

  const parts: WeightComponent[] = [];
  let remaining = Math.round(weightLb * 2) / 2; // nearest 0.5 lb

  for (const block of LARGE_BLOCKS) {
    while (remaining >= block - 1e-9) {
      parts.push({ columnWeightLb: block, factor: 1 });
      remaining = roundDisplay(remaining - block, 3);
    }
  }

  const whole = Math.floor(remaining + 1e-9);
  let fraction = roundDisplay(remaining - whole, 3);

  const hundreds = Math.floor(whole / 100) * 100;
  if (hundreds > 0) {
    parts.push({ columnWeightLb: hundreds, factor: 1 });
  }

  const tens = Math.floor((whole % 100) / 10) * 10;
  if (tens > 0) {
    parts.push({ columnWeightLb: tens * 10, factor: 0.1 });
  }

  const ones = whole % 10;
  if (ones > 0) {
    parts.push({ columnWeightLb: ones * 100, factor: 0.01 });
  }

  if (fraction >= 0.5 - 1e-9) {
    parts.push({ columnWeightLb: 500, factor: 0.001 });
  }

  return parts;
}

/** Proof gallons from net weight (lb) and true proof using TTB Table 3 decomposition. */
export function proofGallonsFromWeight(weightLb: number, proof: number): number {
  if (weightLb <= 0 || proof <= 0) return 0;
  const components = decomposeWeightLb(weightLb);
  const total = components.reduce((sum, part) => {
    const component = table3ColumnProofGallons(proof, part.columnWeightLb) * part.factor;
    return sum + roundTtbProofGallons(component);
  }, 0);
  return roundTtbProofGallons(total);
}

/** Wine gallons at 60 °F from proof gallons. */
export function wineGallonsFromProofGallons(proofGallons: number, proof: number): number {
  if (proofGallons <= 0 || proof <= 0) return 0;
  return roundDisplay((proofGallons * 100) / proof, 4);
}

/** Wine gallons from weight and proof via Table 3. */
export function wineGallonsFromWeight(weightLb: number, proof: number): number {
  const pg = proofGallonsFromWeight(weightLb, proof);
  return wineGallonsFromProofGallons(pg, proof);
}

/** Expected net weight (lb) for a wine-gallon volume at the given proof (inverse search). */
export function weightFromWineGallons(wineGallons: number, proof: number): number {
  if (wineGallons <= 0 || proof <= 0) return 0;

  const targetPg = roundTtbProofGallons(wineGallons * proof / 100);
  let low = 0;
  let high = Math.max(100, wineGallons * 12);
  while (proofGallonsFromWeight(high, proof) < targetPg) {
    high *= 2;
    if (high > 1_000_000) break;
  }

  for (let i = 0; i < 64; i += 1) {
    const mid = (low + high) / 2;
    const pg = proofGallonsFromWeight(mid, proof);
    if (pg < targetPg) low = mid;
    else high = mid;
  }

  return roundDisplay(high, 2);
}

export function litersFromWineGallons(wineGallons: number): number {
  return roundDisplay(wineGallons * LITERS_PER_US_GALLON, 2);
}

export function wineGallonsFromLiters(liters: number): number {
  return roundDisplay(liters / LITERS_PER_US_GALLON, 4);
}

export function lbFromKg(kg: number): number {
  return roundDisplay(kg * LB_PER_KG, 2);
}

export function kgFromLb(lb: number): number {
  return roundDisplay(lb / LB_PER_KG, 2);
}

export function gaugeFromWeightLb(weightLb: number, proof: number): SpiritGaugingResult {
  const normalizedProof = normalizeProof(proof);
  const proofGallons = proofGallonsFromWeight(weightLb, normalizedProof);
  const wineGallons = wineGallonsFromProofGallons(proofGallons, normalizedProof);
  const liters = litersFromWineGallons(wineGallons);
  const lbPerUsGallon = wineGallons > 0 ? roundDisplay(weightLb / wineGallons, 3) : 0;
  const kgPerLiter = liters > 0 ? roundDisplay(kgFromLb(weightLb) / liters, 3) : 0;

  return {
    proof: normalizedProof,
    abv: abvFromProof(normalizedProof),
    weightLb: roundDisplay(weightLb, 2),
    weightKg: kgFromLb(weightLb),
    proofGallons,
    wineGallons: roundDisplay(wineGallons, 2),
    liters,
    lbPerUsGallon,
    kgPerLiter,
  };
}

export function gaugeFromWeightKg(weightKg: number, proof: number): SpiritGaugingResult {
  return gaugeFromWeightLb(lbFromKg(weightKg), proof);
}

export function gaugeFromWineGallons(wineGallons: number, proof: number): SpiritGaugingResult {
  const weightLb = weightFromWineGallons(wineGallons, proof);
  return gaugeFromWeightLb(weightLb, proof);
}

export function gaugeFromLiters(liters: number, proof: number): SpiritGaugingResult {
  return gaugeFromWineGallons(wineGallonsFromLiters(liters), proof);
}

export function gaugeFromWeighingWorkflow(
  grossWeightLb: number,
  tareWeightLb: number,
  proof: number,
): WeighingWorkflowResult {
  const netWeightLb = roundDisplay(Math.max(0, grossWeightLb - tareWeightLb), 2);
  const gauged = gaugeFromWeightLb(netWeightLb, proof);
  return {
    ...gauged,
    grossWeightLb: roundDisplay(grossWeightLb, 2),
    tareWeightLb: roundDisplay(tareWeightLb, 2),
    netWeightLb,
  };
}
