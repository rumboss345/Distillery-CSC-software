import { roundAbv, roundAlcohol } from './reporting/alcohol-units';

export interface StillChargeTankSource {
  volumeGal: number;
  bookAbv: number;
}

function alcoholGal(volumeGal: number, abv: number): number {
  if (!(volumeGal > 0) || !(abv > 0)) return 0;
  return volumeGal * (abv / 100);
}

/**
 * Pure-alcohol difference between what the tank ledger removed and what was measured at the still.
 * Positive is a gain (more alcohol in the charge than the book ABV implied). Negative is a loss.
 */
export function stillChargeSourceAlcoholVarianceGal(input: {
  tankSources: StillChargeTankSource[];
  spiritVolumeGal: number;
  measuredSpiritAbv: number | null;
}): number | null {
  const { tankSources, spiritVolumeGal, measuredSpiritAbv } = input;
  if (measuredSpiritAbv == null || !Number.isFinite(measuredSpiritAbv) || measuredSpiritAbv <= 0) {
    return null;
  }
  if (!(spiritVolumeGal > 0)) return null;
  let bookGal = 0;
  for (const row of tankSources) {
    if (!(row.volumeGal > 0)) continue;
    bookGal += alcoholGal(row.volumeGal, row.bookAbv);
  }
  if (!(bookGal > 0)) return null;
  const measuredGal = alcoholGal(spiritVolumeGal, measuredSpiritAbv);
  if (!(measuredGal > 0)) return null;
  return roundAlcohol(measuredGal - bookGal);
}

/** Book ABV from per-tank source rows (volume-weighted). */
export function stillChargeBookBlendAbv(tankSources: StillChargeTankSource[]): number | null {
  let volume = 0;
  let alcohol = 0;
  for (const row of tankSources) {
    if (!(row.volumeGal > 0)) continue;
    volume += row.volumeGal;
    alcohol += alcoholGal(row.volumeGal, row.bookAbv);
  }
  if (!(volume > 0)) return null;
  return roundAbv((alcohol / volume) * 100);
}

export function formatStillChargeSourceAlcoholVariance(varianceGal: number): string {
  const abs = Math.abs(varianceGal);
  if (!(abs >= 0.005)) return '';
  return varianceGal > 0
    ? `Gain ${abs.toFixed(2)} gal alcohol vs tank book`
    : `Loss ${abs.toFixed(2)} gal alcohol vs tank book`;
}