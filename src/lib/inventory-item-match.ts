import type { InventoryItem } from '../types';

/** Letters and digits only, lowercase — for tolerant name matching. */
export function normalizeInventoryNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) row[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Find one inventory row when the typed name is close to a single stocked item
 * (e.g. Cardamon vs Cardamom).
 */
export function matchInventoryItemInList(
  items: Pick<InventoryItem, 'name'>[],
  name: string,
): Pick<InventoryItem, 'name'> | undefined {
  const trimmed = name.trim();
  if (!trimmed || items.length === 0) return undefined;
  const key = normalizeInventoryNameKey(trimmed);
  if (!key) return undefined;

  const byNormalized = items.filter((item) => normalizeInventoryNameKey(item.name) === key);
  if (byNormalized.length === 1) return byNormalized[0];

  const fuzzy = items.filter((item) => {
    const itemKey = normalizeInventoryNameKey(item.name);
    if (!itemKey) return false;
    return levenshtein(itemKey, key) <= 1;
  });
  if (fuzzy.length === 1) return fuzzy[0];

  return undefined;
}

export function suggestInventoryItemName(
  items: Pick<InventoryItem, 'name'>[],
  name: string,
): string | null {
  return matchInventoryItemInList(items, name)?.name ?? null;
}
