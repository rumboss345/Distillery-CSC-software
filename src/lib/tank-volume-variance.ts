/** Gallons are stored to a thousandth, matching other tank volume writes. */
export function roundThousandths(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Gallons found in the tank minus the gallons already on the record.
 * Negative means the tank is short. Positive means it holds more than the record.
 */
export function tankVolumeVarianceGal(bookGal: number, setGal: number): number {
  return roundThousandths(roundThousandths(setGal) - roundThousandths(bookGal));
}

export function tankVolumeMatchesRecord(varianceGal: number): boolean {
  return Math.abs(roundThousandths(varianceGal)) < 0.005;
}

/** A set-volume save changed the gallons or the ABV enough to track. */
export function tankReadingChanged(
  bookGal: number,
  setGal: number,
  bookAbv: number,
  setAbv: number,
): boolean {
  return Math.abs(tankVolumeVarianceGal(bookGal, setGal)) >= 0.01
    || Math.abs(setAbv - bookAbv) >= 0.05;
}

export function volumeChangeReasonError(reason: string): string | null {
  if (!reason.trim()) return 'Say why this was changed.';
  return null;
}

export function formatTankVolumeVariance(varianceGal: number): string {
  const rounded = roundThousandths(varianceGal);
  if (tankVolumeMatchesRecord(rounded)) return '0.00 gal';
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(2)} gal`;
}
