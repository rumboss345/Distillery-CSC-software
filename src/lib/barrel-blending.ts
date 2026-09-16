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

export function formatBarrelInventoryOption(barrel: Barrel): string {
  const abv = barrel.initial_abv;
  return `${barrel.barrel_number} — ${barrel.spirit_type} (${barrel.current_volume_gal.toFixed(1)} gal @ ${abv.toFixed(1)}%)`;
}

export function spiritLabelForBarrel(barrel: Barrel): string {
  return `${barrel.barrel_number} — ${barrel.spirit_type}`;
}
