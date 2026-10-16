import type { Barrel } from '../types';

/** Barrels available for one spirit row — each barrel may only appear on one row. */
export function barrelsForBlendRow(
  inventory: Barrel[],
  selectedBarrelIds: readonly (number | null | undefined)[],
  rowIndex: number,
): Barrel[] {
  const currentId = selectedBarrelIds[rowIndex] ?? null;
  const usedElsewhere = new Set<number>();
  selectedBarrelIds.forEach((id, i) => {
    if (i !== rowIndex && id != null && id > 0) usedElsewhere.add(id);
  });
  return inventory.filter((b) => b.id === currentId || !usedElsewhere.has(b.id));
}

export function hasDuplicateBarrelSelections(
  selectedBarrelIds: readonly (number | null | undefined)[],
): boolean {
  const seen = new Set<number>();
  for (const id of selectedBarrelIds) {
    if (id == null || id <= 0) continue;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

export function barrelShownContents(barrel: Barrel, blendProductName?: string | null): string {
  return blendProductName?.trim() || barrel.spirit_type;
}

export function formatBarrelInventoryOption(barrel: Barrel, blendProductName?: string | null): string {
  const abv = barrel.initial_abv;
  const contents = barrelShownContents(barrel, blendProductName);
  return `${barrel.barrel_number} — ${contents} (${barrel.current_volume_gal.toFixed(1)} gal @ ${abv.toFixed(1)}%)`;
}

export function spiritLabelForBarrel(barrel: Barrel, blendProductName?: string | null): string {
  return `${barrel.barrel_number} — ${barrelShownContents(barrel, blendProductName)}`;
}

/**
 * Gallons to put back when undoing a blend that emptied this barrel.
 * Production records the volume that was in the barrel. Older batches only stored the formula pull.
 */
export function gallonsRestoredToEmptiedBarrel(
  sources: readonly {
    barrel_id?: number | null;
    volume_gal: number;
    emptied_volume_gal?: number | null;
  }[],
  barrelId: number,
): number {
  const rows = sources.filter((source) => source.barrel_id === barrelId);
  const recorded = rows
    .map((source) => source.emptied_volume_gal)
    .filter((volume): volume is number => volume != null && volume > 0);
  if (recorded.length > 0) return Math.max(...recorded);
  return rows.reduce((sum, source) => sum + Math.max(0, source.volume_gal), 0);
}
