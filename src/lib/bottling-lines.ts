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
