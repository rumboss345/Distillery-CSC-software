import { mlToGallons } from '../types';

/** Rum bottling uses bottle dropdown + size; UI hides the packaging stock card while the form is open. */
export function isRumBottlingProduct(productName: string): boolean {
  return /\brum\b/i.test(productName.trim());
}

/** Bottle counts grouped by packaging SKU name (inventory item name). */
export function packagingBottleCountsBySku(
  lines: { packaging_bottle?: string; bottle_count: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of lines) {
    const name = line.packaging_bottle?.trim();
    if (!name || line.bottle_count <= 0) continue;
    out[name] = (out[name] ?? 0) + line.bottle_count;
  }
  return out;
}

/** Inventory quantity adjustment per SKU (positive = add back to stock, negative = consume). */
export function packagingInventoryAdjustments(
  previous: Record<string, number>,
  next: Record<string, number>,
): Record<string, number> {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const adj: Record<string, number> = {};
  for (const sku of keys) {
    const delta = (previous[sku] ?? 0) - (next[sku] ?? 0);
    if (delta !== 0) adj[sku] = delta;
  }
  return adj;
}

/** Extra bottles needed vs a prior saved run (for stock checks on edit). */
export function additionalPackagingNeeded(
  previous: Record<string, number>,
  next: Record<string, number>,
): Record<string, number> {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const need: Record<string, number> = {};
  for (const sku of keys) {
    const extra = (next[sku] ?? 0) - (previous[sku] ?? 0);
    if (extra > 0) need[sku] = extra;
  }
  return need;
}

export interface BottlingLineAmount {
  bottle_count: number;
  bottle_size_ml: number;
  packaging_bottle?: string;
}

export function lineVolumeGal(line: BottlingLineAmount): number {
  if (line.bottle_count <= 0 || line.bottle_size_ml <= 0) return 0;
  return mlToGallons(line.bottle_count * line.bottle_size_ml);
}

export function totalVolumeGal(lines: BottlingLineAmount[]): number {
  return lines.reduce((sum, line) => sum + lineVolumeGal(line), 0);
}

export function totalBottleCount(lines: BottlingLineAmount[]): number {
  return lines.reduce((sum, line) => sum + (line.bottle_count > 0 ? line.bottle_count : 0), 0);
}

/** Bottled gallons plus gallons sent to another tank, minus the gallons drawn from the source. */
export function bottlingVolumeVarianceGal(sourceGal: number, bottledGal: number, returnGal: number): number {
  const returned = Number.isFinite(returnGal) && returnGal > 0 ? returnGal : 0;
  return bottledGal + returned - sourceGal;
}

/** Gallons from a bottling run that were sent to a tank instead of bottled. */
export function bottlingSentToTankGal(run: {
  returns?: { volume_gal: number }[] | null;
  return_volume_gal?: number | null;
}): number {
  const lines = run.returns ?? [];
  if (lines.length > 0) {
    return lines.reduce((sum, line) => sum + (line.volume_gal > 0 ? line.volume_gal : 0), 0);
  }
  const header = run.return_volume_gal ?? 0;
  return header > 0 ? header : 0;
}

/**
 * Variance after gallons sent to a tank. Those gallons are still on hand, so they are not a loss.
 * When the source draw and bottled gallons are known, the figure is recomputed so an older
 * stored variance that ignored the tank return is not reported as a loss.
 */
export function reportedBottlingVarianceGal(run: {
  source_volume_gal?: number | null;
  bottled_volume_gal?: number | null;
  volume_variance_gal?: number | null;
  returns?: { volume_gal: number }[] | null;
  return_volume_gal?: number | null;
}): number | null {
  if (run.source_volume_gal != null && run.bottled_volume_gal != null) {
    return bottlingVolumeVarianceGal(
      run.source_volume_gal,
      run.bottled_volume_gal,
      bottlingSentToTankGal(run),
    );
  }
  return run.volume_variance_gal ?? null;
}

export interface BottlingReturnCheck {
  tankId: number | null;
  gallons: number;
  name?: string;
  destVolumeGal?: number;
  destCapacityGal?: number;
}

export function bottlingReturnsTotalGal(returns: { gallons: number }[]): number {
  return returns.reduce((sum, line) => {
    const gallons = line.gallons;
    return sum + (Number.isFinite(gallons) && gallons > 0 ? gallons : 0);
  }, 0);
}

/** Reject a split of unbottled gallons across one or more destination tanks. */
export function bottlingReturnsError(input: {
  returns: BottlingReturnCheck[];
  unbottledGal: number;
  sourceTankId: number | null;
}): string | null {
  const active = input.returns.filter((line) => {
    const sending = Number.isFinite(line.gallons) && line.gallons > 0.001;
    return sending || line.tankId != null;
  });
  const seen = new Set<number>();
  let total = 0;
  for (const line of active) {
    const sending = Number.isFinite(line.gallons) && line.gallons > 0.001;
    const name = line.name?.trim() || 'That tank';
    if (!sending) {
      return line.name?.trim()
        ? `Enter how many gallons go to ${line.name.trim()}.`
        : 'Enter how many gallons go to the tank.';
    }
    if (!line.tankId) return 'Choose the tank that receives the product that is not bottled.';
    if (line.tankId === input.sourceTankId) {
      return 'Choose a different tank than the one you are bottling from.';
    }
    if (seen.has(line.tankId)) return `${name} is already selected. Pick each tank once.`;
    seen.add(line.tankId);
    total += line.gallons;
    const capacity = line.destCapacityGal ?? 0;
    if (capacity > 0) {
      const destVolume = line.destVolumeGal ?? 0;
      if (destVolume + line.gallons > capacity + 0.01) {
        const room = Math.max(0, capacity - destVolume);
        return `${name} only has ${room.toFixed(1)} gal of room left.`;
      }
    }
  }
  const left = Math.max(0, input.unbottledGal);
  if (total > left + 0.01) return `Only ${left.toFixed(2)} gal is left after bottling.`;
  return null;
}

export function bottlingReturnError(input: {
  returnGal: number;
  unbottledGal: number;
  destTankId: number | null;
  sourceTankId: number | null;
  destName?: string;
  destVolumeGal?: number;
  destCapacityGal?: number;
}): string | null {
  const gallons = input.returnGal;
  const sending = Number.isFinite(gallons) && gallons > 0.001;
  if (!sending) {
    if (input.destTankId) return 'Enter how many gallons go to the tank.';
    return null;
  }
  if (!input.destTankId) return 'Choose the tank that receives the product that is not bottled.';
  if (input.destTankId === input.sourceTankId) {
    return 'Choose a different tank than the one you are bottling from.';
  }
  const left = Math.max(0, input.unbottledGal);
  if (gallons > left + 0.01) {
    return `Only ${left.toFixed(2)} gal is left after bottling.`;
  }
  const capacity = input.destCapacityGal ?? 0;
  if (capacity > 0) {
    const destVolume = input.destVolumeGal ?? 0;
    if (destVolume + gallons > capacity + 0.01) {
      const room = Math.max(0, capacity - destVolume);
      const name = input.destName?.trim() || 'That tank';
      return `${name} only has ${room.toFixed(1)} gal of room left.`;
    }
  }
  return null;
}

export function maxBottlesFromGallons(remainingGal: number, sizeMl: number): number {
  if (remainingGal <= 0 || sizeMl <= 0) return 0;
  const galPerBottle = mlToGallons(sizeMl);
  if (galPerBottle <= 0) return 0;
  return Math.floor(remainingGal / galPerBottle);
}

export function formatLinesSummary(lines: BottlingLineAmount[]): string {
  const active = lines.filter((line) => line.bottle_count > 0);
  if (active.length === 0) return '—';
  return active.map((line) => {
    const label = line.packaging_bottle?.trim()
      || `${line.bottle_size_ml} ml`;
    return `${label} × ${line.bottle_count.toLocaleString()}`;
  }).join(', ');
}
