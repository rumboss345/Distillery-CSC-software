import { computeLpa } from '../liquid-ledger/balance.js';

/** Volume (L) + ABV (0–100) are authoritative; LPA is derived. */
export function resolveOutputLpa(volumeLitres: number, abv: number, providedLpa?: number | null): number {
  const derived = computeLpa(volumeLitres, abv);
  if (providedLpa != null && Math.abs(providedLpa - derived) > 0.01) {
    throw new Error(
      `Output LPA (${providedLpa}) is inconsistent with volume (${volumeLitres} L) and ABV (${abv}%). Expected ${derived} LPA.`,
    );
  }
  return derived;
}
