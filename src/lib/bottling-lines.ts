import { mlToGallons } from '../types';

/** Rum bottling runs skip packaging-inventory SKUs (size + count only). */
export function isRumBottlingProduct(productName: string): boolean {
  return /\brum\b/i.test(productName.trim());
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
