import { litresPureAlcohol } from '../units.js';

export interface BalanceSnapshot {
  volumeLitres: number;
  lpa: number;
  abv: number;
}

/** Compute LPA from volume and ABV (0–100). */
export function computeLpa(volumeLitres: number, abv: number): number {
  return litresPureAlcohol(volumeLitres, abv);
}

/** Weighted ABV from total volume and LPA — never average ABVs directly. */
export function computeAbvFromLpa(volumeLitres: number, lpa: number): number {
  if (volumeLitres <= 0) return 0;
  return (lpa / volumeLitres) * 100;
}

/** Build balance snapshot from aggregated volume and LPA. */
export function balanceFromVolumeLpa(volumeLitres: number, lpa: number): BalanceSnapshot {
  const volume = Math.max(0, volumeLitres);
  const alcohol = volumeLitres > 0 ? Math.max(0, lpa) : 0;
  return {
    volumeLitres: volume,
    lpa: alcohol,
    abv: computeAbvFromLpa(volume, alcohol),
  };
}

/** Apply a signed volume/LPA delta to a balance snapshot. */
export function applyBalanceDelta(
  current: BalanceSnapshot,
  deltaVolume: number,
  deltaLpa: number,
): BalanceSnapshot {
  return balanceFromVolumeLpa(current.volumeLitres + deltaVolume, current.lpa + deltaLpa);
}

/** Capacity utilization percentage. */
export function capacityUtilizationPercent(volumeLitres: number, capacityLitres: number): number {
  if (capacityLitres <= 0) return 0;
  return Math.min(100, (volumeLitres / capacityLitres) * 100);
}
