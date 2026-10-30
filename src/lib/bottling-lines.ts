import { mlToGallons, type RunStatus } from '../types';
import { formatDistillationAlcoholResult } from './distillation-loss';
import { roundAlcohol } from './reporting/alcohol-units';

export type BottlingStatus = RunStatus;

export const BOTTLING_STATUSES: BottlingStatus[] = ['planned', 'running', 'complete'];
/** Running stays above planned. Finished runs stay last. */
export const BOTTLING_STATUS_LIST_ORDER: BottlingStatus[] = ['running', 'planned', 'complete'];

export const BOTTLING_STATUS_LABELS: Record<BottlingStatus, string> = {
  planned: 'Planned',
  running: 'Running',
  complete: 'Finished',
};

export function isBottlingStatus(value: string | null | undefined): value is BottlingStatus {
  return value === 'planned' || value === 'running' || value === 'complete';
}

/** Existing runs with no status were already finished. */
export function normalizeBottlingStatus(value: string | null | undefined): BottlingStatus {
  return isBottlingStatus(value) ? value : 'complete';
}

export function bottlingIsPlanned(status: string | null | undefined): boolean {
  return normalizeBottlingStatus(status) === 'planned';
}

export function bottlingCountsTowardProduction(status: string | null | undefined): boolean {
  return normalizeBottlingStatus(status) !== 'planned';
}

/** Rum bottling uses bottle dropdown + size; UI hides the packaging stock card while the form is open. */
export function isRumBottlingProduct(productName: string): boolean {
  return /\brum\b/i.test(productName.trim());
}

function skuCountsByName(
  lines: { name?: string | null; bottle_count: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of lines) {
    const name = line.name?.trim();
    if (!name || line.bottle_count <= 0) continue;
    out[name] = (out[name] ?? 0) + line.bottle_count;
  }
  return out;
}

/** Bottle counts grouped by packaging SKU name (inventory item name). */
export function packagingBottleCountsBySku(
  lines: { packaging_bottle?: string; bottle_count: number }[],
): Record<string, number> {
  return skuCountsByName(lines.map((line) => ({
    name: line.packaging_bottle,
    bottle_count: line.bottle_count,
  })));
}

/** Label counts grouped by labels-category inventory item name. */
export function packagingLabelCountsBySku(
  lines: { packaging_label?: string; bottle_count: number }[],
): Record<string, number> {
  return skuCountsByName(lines.map((line) => ({
    name: line.packaging_label,
    bottle_count: line.bottle_count,
  })));
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
  packaging_label?: string;
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

export interface BottleSizeCount {
  sizeMl: number;
  count: number;
}

/** Bottle counts grouped by size, largest size first. */
export function bottleSizeCounts(lines: BottlingLineAmount[]): BottleSizeCount[] {
  const bySize = new Map<number, number>();
  for (const line of lines) {
    if (line.bottle_count <= 0 || line.bottle_size_ml <= 0) continue;
    bySize.set(line.bottle_size_ml, (bySize.get(line.bottle_size_ml) ?? 0) + line.bottle_count);
  }
  return [...bySize.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([sizeMl, count]) => ({ sizeMl, count }));
}

export function formatBottleSizes(lines: BottlingLineAmount[]): string {
  const sizes = bottleSizeCounts(lines);
  if (sizes.length === 0) return '—';
  return sizes.map((size) => `${size.count.toLocaleString()} × ${size.sizeMl} ml`).join(', ');
}

/** Bottled gallons plus gallons sent to another tank, minus the gallons drawn from the source. */
export function bottlingVolumeVarianceGal(sourceGal: number, bottledGal: number, returnGal: number): number {
  const returned = Number.isFinite(returnGal) && returnGal > 0 ? returnGal : 0;
  return bottledGal + returned - sourceGal;
}

/**
 * Pure alcohol in the bottles and in gallons sent back to a tank, minus the pure alcohol drawn.
 * Positive is a gain. Returns null when the source strength or the bottled strength is not known.
 * Gallons sent to a tank stay at the bottling ABV, so they are still on hand.
 */
export function bottlingAlcoholVarianceGal(input: {
  sourceGal: number;
  sourceAbv: number | null | undefined;
  bottledGal: number;
  bottledAbv: number | null | undefined;
  returnGal: number;
}): number | null {
  const { sourceGal, sourceAbv, bottledGal, bottledAbv, returnGal } = input;
  if (sourceAbv == null || !Number.isFinite(sourceAbv) || sourceAbv < 0) return null;
  if (bottledAbv == null || !Number.isFinite(bottledAbv) || bottledAbv <= 0) return null;
  if (!Number.isFinite(sourceGal) || sourceGal < 0) return null;
  if (!Number.isFinite(bottledGal) || bottledGal < 0) return null;
  const returned = Number.isFinite(returnGal) && returnGal > 0 ? returnGal : 0;
  const drawn = sourceGal * (sourceAbv / 100);
  const accounted = (bottledGal + returned) * (bottledAbv / 100);
  return roundAlcohol(accounted - drawn);
}

/** "Gain 2.00 gal alcohol" or "Loss 2.00 gal alcohol". Positive variance is a gain. */
export function formatBottlingAlcoholVariance(varianceGal: number): string {
  return `${formatDistillationAlcoholResult(-varianceGal)} alcohol`;
}

export function describeBottlingVarianceChange(input: {
  volumeVarianceGal: number | null;
  alcoholVarianceGal: number | null;
  productName: string;
}): string {
  const parts: string[] = [];
  if (input.volumeVarianceGal != null && Math.abs(input.volumeVarianceGal) >= 0.01) {
    const gallons = input.volumeVarianceGal;
    parts.push(`${gallons > 0 ? '+' : ''}${gallons.toFixed(2)} gal vs the tank`);
  }
  if (input.alcoholVarianceGal != null && Math.abs(input.alcoholVarianceGal) >= 0.01) {
    parts.push(formatBottlingAlcoholVariance(input.alcoholVarianceGal));
  }
  const detail = parts.length > 0 ? parts.join('. ') : 'No variance';
  return `${detail} (${input.productName})`;
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

/**
 * Alcohol gained or lost on a bottling run.
 * Recomputed when the source strength was stored with the run. Older runs that
 * never stored that strength stay blank rather than guessing an ABV.
 */
export function reportedBottlingAlcoholVarianceGal(run: {
  source_volume_gal?: number | null;
  source_abv?: number | null;
  bottled_volume_gal?: number | null;
  final_abv?: number | null;
  alcohol_variance_gal?: number | null;
  returns?: { volume_gal: number }[] | null;
  return_volume_gal?: number | null;
}): number | null {
  if (
    run.source_volume_gal != null
    && run.bottled_volume_gal != null
    && run.source_abv != null
    && run.final_abv != null
  ) {
    const computed = bottlingAlcoholVarianceGal({
      sourceGal: run.source_volume_gal,
      sourceAbv: run.source_abv,
      bottledGal: run.bottled_volume_gal,
      bottledAbv: run.final_abv,
      returnGal: bottlingSentToTankGal(run),
    });
    if (computed != null) return computed;
  }
  return run.alcohol_variance_gal ?? null;
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
    if (seen.has(line.tankId)) return `${name} is already selected. Pick each tank once.`;
    seen.add(line.tankId);
    total += line.gallons;
    const leaveInSource = line.tankId === input.sourceTankId;
    const capacity = line.destCapacityGal ?? 0;
    if (!leaveInSource && capacity > 0) {
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
  const left = Math.max(0, input.unbottledGal);
  if (gallons > left + 0.01) {
    return `Only ${left.toFixed(2)} gal is left after bottling.`;
  }
  const leaveInSource = input.destTankId === input.sourceTankId;
  const capacity = input.destCapacityGal ?? 0;
  if (!leaveInSource && capacity > 0) {
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
    const bottle = line.packaging_bottle?.trim()
      || `${line.bottle_size_ml} ml`;
    const label = line.packaging_label?.trim();
    const sku = label ? `${bottle} + ${label}` : bottle;
    return `${sku} × ${line.bottle_count.toLocaleString()}`;
  }).join(', ');
}
