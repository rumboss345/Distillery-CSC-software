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

export interface PackagingSizeSource {
  name: string;
  notes?: string | null;
  package_size_ml?: number | null;
}

/** Saved bottle or package size, then a size written in the notes or name. */
export function packagingItemSizeMl(item: PackagingSizeSource): number | null {
  if (item.package_size_ml != null && item.package_size_ml > 0) {
    return Math.round(item.package_size_ml);
  }
  return packagingSizeMlFromText(item.notes ?? '') ?? packagingSizeMlFromText(item.name);
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
  inventory: PackagingSizeSource[],
): PackagingBottleOption[] {
  const savedByName = new Map<string, PackagingSizeSource>();
  for (const item of inventory) {
    const name = item.name.trim();
    if (!name) continue;
    savedByName.set(name.toLowerCase(), item);
  }
  const seen = new Set(PACKAGING_BOTTLES.map((bottle) => bottle.name.toLowerCase()));
  const catalog = PACKAGING_BOTTLES.map((bottle) => {
    const saved = savedByName.get(bottle.name.toLowerCase());
    const explicit = saved?.package_size_ml;
    return {
      name: bottle.name,
      sizeMl: explicit != null && explicit > 0 ? Math.round(explicit) : bottle.sizeMl,
    };
  });
  const extras: PackagingBottleOption[] = [];
  for (const item of inventory) {
    const name = item.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push({ name, sizeMl: packagingItemSizeMl(item) });
  }
  extras.sort((a, b) => a.name.localeCompare(b.name));
  return [...catalog, ...extras];
}
