import { BASE_COSTING_CURRENCY } from './constants.js';
import { fromMinor, toMinor } from './money.js';

export type FxSnapshot = {
  originalCurrency: string;
  originalAmount: number;
  exchangeRateToKyd: number;
  kydAmount: number;
  exchangeRateSource?: string | null;
  exchangeRateDate?: string | null;
  exchangeRateNotes?: string | null;
};

/**
 * Convert foreign currency to KYD.
 * Direction: 1 unit of source currency × rate = KYD.
 * Example: USD $1,000 × 0.82 = KYD $820.
 */
export function convertToKyd(
  originalAmount: number,
  exchangeRateToKyd: number,
): number {
  if (!Number.isFinite(originalAmount) || !Number.isFinite(exchangeRateToKyd)) {
    throw new Error('Invalid FX conversion inputs.');
  }
  if (exchangeRateToKyd < 0) throw new Error('Exchange rate must be non-negative.');
  const minor = toMinor(originalAmount);
  const rateMinor = toMinor(exchangeRateToKyd);
  const kydMinor = (minor * rateMinor) / toMinor(1);
  return fromMinor(kydMinor);
}

export function buildFxSnapshot(input: {
  originalCurrency: string;
  originalAmount: number;
  exchangeRateToKyd: number;
  exchangeRateSource?: string | null;
  exchangeRateDate?: string | null;
  exchangeRateNotes?: string | null;
}): FxSnapshot {
  const currency = input.originalCurrency.toUpperCase();
  const rate = currency === BASE_COSTING_CURRENCY ? 1 : input.exchangeRateToKyd;
  if (currency !== BASE_COSTING_CURRENCY && rate <= 0) {
    throw new Error('Exchange rate to KYD is required for foreign currency.');
  }
  return {
    originalCurrency: currency,
    originalAmount: input.originalAmount,
    exchangeRateToKyd: rate,
    kydAmount: convertToKyd(input.originalAmount, rate),
    exchangeRateSource: input.exchangeRateSource ?? null,
    exchangeRateDate: input.exchangeRateDate ?? null,
    exchangeRateNotes: input.exchangeRateNotes ?? null,
  };
}

/** Historical FX snapshots are immutable once finalized — this validates no mutation. */
export function assertFxSnapshotImmutable(
  before: FxSnapshot,
  after: Partial<FxSnapshot>,
): void {
  if (after.kydAmount != null && Math.abs(after.kydAmount - before.kydAmount) > 0.000001) {
    throw new Error('Historical FX snapshot cannot be modified.');
  }
  if (after.exchangeRateToKyd != null && after.exchangeRateToKyd !== before.exchangeRateToKyd) {
    throw new Error('Historical exchange rate cannot be modified.');
  }
}
