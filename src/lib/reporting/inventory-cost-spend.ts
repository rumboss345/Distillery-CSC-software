import { getInventoryItems } from '../../db/queries';
import { inventoryQuantityDelta } from '../inventory-units';
import type { InventoryCostChange, InventoryItem } from '../../types';
import { inventoryCostAt } from '../inventory-cost-at';

export interface InventoryCostEntry {
  id: number;
  key: string;
  category: string;
  currentCost: number | null;
  changes: InventoryCostChange[];
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function inventoryCostKey(category: string, name: string): string {
  return `${category.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
}

function entryCostAt(entry: InventoryCostEntry, at: string): number | null {
  return inventoryCostAt(entry.currentCost, entry.changes, at);
}

/** Unit cost for a category + name at a date (fuzzy name match within category). */
export function lookupInventoryCost(
  index: InventoryCostEntry[],
  category: string,
  name: string,
  at: string,
): number | null {
  const key = inventoryCostKey(category, name);
  for (let i = index.length - 1; i >= 0; i -= 1) {
    if (index[i].key !== key) continue;
    const cost = entryCostAt(index[i], at);
    if (cost != null) return cost;
  }
  const prefix = `${category.toLowerCase()}::`;
  const wanted = name.toLowerCase();
  for (const entry of index) {
    if (!entry.key.startsWith(prefix)) continue;
    const itemName = entry.key.slice(prefix.length);
    if (!itemName || !(wanted.includes(itemName) || itemName.includes(wanted))) continue;
    const cost = entryCostAt(entry, at);
    if (cost != null) return cost;
  }
  return null;
}

function nameFuzzyMatch(wanted: string, candidate: string): boolean {
  if (!wanted || !candidate) return false;
  return wanted.includes(candidate) || candidate.includes(wanted);
}

export interface InventoryItemLookup {
  inventoryItemId?: number | null;
  category?: string;
  name?: string;
}

/** Resolve stock for costing — id, then category + name (same rules as cost lookup), then any category by name. */
export function findInventoryItemForCosting(
  lookup: InventoryItemLookup,
  index: InventoryCostEntry[],
): InventoryItem | null {
  const items = getInventoryItems();
  if (lookup.inventoryItemId != null) {
    return items.find((row) => row.id === lookup.inventoryItemId) ?? null;
  }

  const nameRaw = lookup.name?.trim() ?? '';
  if (!nameRaw) return null;
  const wanted = nameRaw.toLowerCase();
  const category = lookup.category?.trim();

  if (category) {
    const inCategory = items.filter(
      (row) => row.category.trim().toLowerCase() === category.toLowerCase(),
    );
    const exact = inCategory.find((row) => row.name.trim().toLowerCase() === wanted);
    if (exact) return exact;
    for (const row of inCategory) {
      const itemName = row.name.trim().toLowerCase();
      if (nameFuzzyMatch(wanted, itemName)) return row;
    }

    const key = inventoryCostKey(category, nameRaw);
    const entry = index.find((row) => row.key === key);
    if (entry) {
      return items.find((row) => row.id === entry.id) ?? null;
    }
    const prefix = `${category.toLowerCase()}::`;
    for (const costEntry of index) {
      if (!costEntry.key.startsWith(prefix)) continue;
      const itemName = costEntry.key.slice(prefix.length);
      if (!itemName || !nameFuzzyMatch(wanted, itemName)) continue;
      const match = items.find((row) => row.id === costEntry.id);
      if (match) return match;
    }
  }

  for (const row of items) {
    const itemName = row.name.trim().toLowerCase();
    if (nameFuzzyMatch(wanted, itemName)) return row;
  }

  const wantedLower = wanted;
  for (const costEntry of index) {
    const itemName = costEntry.key.includes('::')
      ? costEntry.key.split('::').slice(1).join('::')
      : costEntry.key;
    if (!nameFuzzyMatch(wantedLower, itemName)) continue;
    const match = items.find((row) => row.id === costEntry.id);
    if (match) return match;
  }

  return null;
}

/**
 * Dollar spend for a measured amount against inventory pricing.
 * Always converts `amount` + `unit` into the inventory item's unit before multiplying by unit cost.
 */
export function spendFromInventoryLine(
  amount: number,
  unit: string,
  item: InventoryItem,
  at: string,
  index: InventoryCostEntry[],
  fallbackUnitCost?: number | null,
): number {
  if (!(amount > 0)) return 0;
  const qty = inventoryQuantityDelta(amount, unit, item.unit);
  if (qty == null || !(qty > 0)) return 0;
  const entry = index.find((row) => row.id === item.id);
  const unitCost = (entry ? entryCostAt(entry, at) : null)
    ?? (fallbackUnitCost != null && fallbackUnitCost >= 0 ? fallbackUnitCost : null)
    ?? lookupInventoryCost(index, item.category, item.name, at)
    ?? (item.cost_per_unit != null && item.cost_per_unit >= 0 ? item.cost_per_unit : null);
  if (unitCost == null || !(unitCost >= 0)) return 0;
  return roundMoney(qty * unitCost);
}

/** Resolve stock and compute spend when id, category, or name is known. */
export function spendFromInventoryLookup(
  amount: number,
  unit: string,
  lookup: InventoryItemLookup,
  at: string,
  index: InventoryCostEntry[],
  fallbackUnitCost?: number | null,
): number {
  const item = findInventoryItemForCosting(lookup, index);
  if (!item) return 0;
  return spendFromInventoryLine(amount, unit, item, at, index, fallbackUnitCost);
}