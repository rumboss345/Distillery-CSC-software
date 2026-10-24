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

/** Bottling choices: packaging inventory items only. */
export function packagingBottleOptions(
  inventory: PackagingSizeSource[],
): PackagingBottleOption[] {
  const options: PackagingBottleOption[] = [];
  const seen = new Set<string>();
  for (const item of inventory) {
    const name = item.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ name, sizeMl: packagingItemSizeMl(item) });
  }
  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}
