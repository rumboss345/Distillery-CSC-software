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
