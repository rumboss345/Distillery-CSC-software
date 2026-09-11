/** Convert Brix (Balling) to specific gravity. */
export function brixToSg(brix: number): number {
  return 1 + brix / (258.6 - (brix / 258.2) * 227.1);
}

/**
 * Estimate ABV from starting and current Brix using SG conversion
 * and the standard (OG − FG) × 131.25 formula.
 */
export function estimateAbvFromBrix(startBrix: number, currentBrix: number): number | null {
  if (!Number.isFinite(startBrix) || !Number.isFinite(currentBrix)) return null;
  if (startBrix <= 0) return null;
  const og = brixToSg(startBrix);
  const fg = brixToSg(currentBrix);
  const abv = (og - fg) * 131.25;
  if (!Number.isFinite(abv)) return null;
  return Math.round(abv * 10) / 10;
}

export function formatAbvEstimate(abv: number | null): string {
  if (abv == null) return '—';
  return `${abv.toFixed(1)}%`;
}
