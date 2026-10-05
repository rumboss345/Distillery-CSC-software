export interface PackagingBottle {
  name: string;
  sizeMl: number;
}

/** Standard packaging bottle SKUs for bottling and inventory. */
export const PACKAGING_BOTTLES: PackagingBottle[] = [
  { name: '1L Hutchings', sizeMl: 1000 },
  { name: '1L Governors', sizeMl: 1000 },
  { name: '1L Bobos', sizeMl: 1000 },
  { name: '750mL 7F', sizeMl: 750 },
  { name: '750mL Pirate', sizeMl: 750 },
  { name: '750mL Gin', sizeMl: 750 },
  { name: '750mL Muse', sizeMl: 750 },
  { name: '375mL Oslo', sizeMl: 375 },
  { name: '200mL Flask', sizeMl: 200 },
  { name: '50mL Airplane', sizeMl: 50 },
];

export function packagingBottleByName(name: string): PackagingBottle | undefined {
  return PACKAGING_BOTTLES.find((b) => b.name.toLowerCase() === name.toLowerCase());
}

export interface PackagingBottleOption {
  name: string;
  sizeMl: number | null;
}

/** Milliliters from a bottle name or note such as "500 ml bottle" or "1L Flask". */
export function packagingSizeMlFromText(text: string): number | null {
  const ml = text.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (ml) {
    const size = Math.round(parseFloat(ml[1]));
    return size > 0 ? size : null;
  }
  const liters = text.match(/(\d+(?:\.\d+)?)\s*l\b/i);
  if (liters) {
    const size = Math.round(parseFloat(liters[1]) * 1000);
    return size > 0 ? size : null;
  }
  return null;
}

/**
 * Bottling choices: the standard bottle list, plus any packaging inventory
 * item that is not already on that list.
 */
export function packagingBottleOptions(
  inventory: { name: string; notes?: string | null }[],
): PackagingBottleOption[] {
  const seen = new Set(PACKAGING_BOTTLES.map((bottle) => bottle.name.toLowerCase()));
  const extras: PackagingBottleOption[] = [];
  for (const item of inventory) {
    const name = item.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push({
      name,
      sizeMl: packagingSizeMlFromText(item.notes ?? '') ?? packagingSizeMlFromText(name),
    });
  }
  extras.sort((a, b) => a.name.localeCompare(b.name));
  return [
    ...PACKAGING_BOTTLES.map((bottle) => ({ name: bottle.name, sizeMl: bottle.sizeMl })),
    ...extras,
  ];
}
