import type { Barrel } from '../types';

export function formatBarrelInventoryOption(barrel: Barrel): string {
  const abv = barrel.initial_abv;
  return `${barrel.barrel_number} — ${barrel.spirit_type} (${barrel.current_volume_gal.toFixed(1)} gal @ ${abv.toFixed(1)}%)`;
}

export function spiritLabelForBarrel(barrel: Barrel): string {
  return `${barrel.barrel_number} — ${barrel.spirit_type}`;
}
