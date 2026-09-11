import { ALLOCATION_TOLERANCE, MONEY_SCALE } from './constants.js';

/** Integer minor units at MONEY_SCALE decimal places for deterministic arithmetic. */
export type MoneyMinor = bigint;

const SCALE_FACTOR = BigInt(10 ** MONEY_SCALE);

function parseToMinor(value: number | string): MoneyMinor {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid money value.');
    const str = value.toFixed(MONEY_SCALE);
    return parseToMinor(str);
  }
  const trimmed = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid money string: ${value}`);
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ''] = abs.split('.');
  const paddedFrac = frac.padEnd(MONEY_SCALE, '0').slice(0, MONEY_SCALE);
  const minor = BigInt(whole + paddedFrac);
  return negative ? -minor : minor;
}

export function toMinor(value: number | string): MoneyMinor {
  return parseToMinor(value);
}

export function fromMinor(minor: MoneyMinor): number {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / SCALE_FACTOR;
  const frac = abs % SCALE_FACTOR;
  const fracStr = frac.toString().padStart(MONEY_SCALE, '0');
  const num = Number(`${whole}.${fracStr}`);
  return negative ? -num : num;
}

export function addMoney(a: MoneyMinor, b: MoneyMinor): MoneyMinor {
  return a + b;
}

export function subtractMoney(a: MoneyMinor, b: MoneyMinor): MoneyMinor {
  return a - b;
}

export function multiplyMoney(minor: MoneyMinor, factor: number | string): MoneyMinor {
  const f = parseToMinor(factor);
  return (minor * f) / SCALE_FACTOR;
}

export function divideMoney(minor: MoneyMinor, divisor: number | string): MoneyMinor {
  const d = parseToMinor(divisor);
  if (d === 0n) throw new Error('Division by zero.');
  return (minor * SCALE_FACTOR) / d;
}

export function sumMinor(values: MoneyMinor[]): MoneyMinor {
  return values.reduce((acc, v) => acc + v, 0n);
}

export function roundDisplay(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Allocate a total across lines proportionally by weight.
 * Deterministic remainder: largest remainder method with stable tie-break by index.
 */
export function allocateProportionally(
  totalKyd: number | string,
  weights: number[],
): number[] {
  if (weights.length === 0) return [];
  const total = typeof totalKyd === 'string' ? fromMinor(parseToMinor(totalKyd)) : totalKyd;
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum <= 0) throw new Error('Allocation weights must sum to a positive value.');

  const exactShares = weights.map((w) => (total * w) / weightSum);
  const floors = exactShares.map((v) => Math.floor(v * 100) / 100);
  let remainderCents = Math.round(total * 100) - floors.reduce((s, v) => s + Math.round(v * 100), 0);

  const remainders = exactShares.map((v, i) => ({
    index: i,
    remainder: v - floors[i]!,
  }));
  remainders.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.index - b.index;
  });

  const result = [...floors];
  let ri = 0;
  while (remainderCents !== 0 && ri < remainders.length * 100) {
    const idx = remainders[ri % remainders.length]!.index;
    result[idx] = (Math.round(result[idx]! * 100) + (remainderCents > 0 ? 1 : -1)) / 100;
    remainderCents += remainderCents > 0 ? -1 : 1;
    ri++;
  }

  return result;
}

/** Verify 0.1 + 0.2 style safety — returns true if addition is exact at scale. */
export function isExactAtScale(a: number, b: number): boolean {
  const sum = fromMinor(parseToMinor(a) + parseToMinor(b));
  return Math.abs(sum - 0.3) < ALLOCATION_TOLERANCE;
}

export function assertAllocationTotal(
  allocations: number[],
  expectedTotal: number | string,
): void {
  const sum = allocations.reduce((s, v) => s + v, 0);
  const expected = typeof expectedTotal === 'string' ? fromMinor(parseToMinor(expectedTotal)) : expectedTotal;
  if (Math.abs(sum - expected) > ALLOCATION_TOLERANCE) {
    throw new Error(
      `Allocation total ${sum} does not equal expected ${expected}.`,
    );
  }
}
