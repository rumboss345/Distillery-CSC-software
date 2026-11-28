import { queryAll } from '../../db/database';
import {
  getBlendIngredients,
  getBlendProducts,
  getDistillationRuns,
  getInventoryItems,
} from '../../db/queries';
import { BARREL_STOCK_CATEGORY, BARREL_STOCK_ITEM_NAME } from '../barrel-inventory';
import { inventoryQuantityDelta } from '../inventory-units';
import type { BlendIngredient, InventoryCostChange, InventoryItem } from '../../types';
import { inventoryCostAt } from '../inventory-cost-at';
import { eventInReportRange, type ReportDateRange } from './period';

export interface ProductionConsumptionTotals {
  blendAdditive: number;
  ginBotanical: number;
  barrelCooperage: number;
  total: number;
}

export interface ProductionConsumptionRow {
  group: 'blend' | 'still' | 'overhead';
  label: string;
  detail?: string;
  date?: string;
  meta?: string;
  amount: number;
}

interface InventoryCostEntry {
  id: number;
  key: string;
  category: string;
  currentCost: number | null;
  changes: InventoryCostChange[];
}

interface RunBotanicalRow {
  distillation_run_id: number;
  name: string;
  inventory_item_id: number | null;
  weight: number;
  weight_unit: string;
}

interface UsageLogRow {
  inventory_item_id: number;
  delta: number;
  created_at: string;
  source_kind: string;
  source_ref: string;
  summary: string;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inventoryKey(category: string, name: string): string {
  return `${category.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
}

function entryCostAt(entry: InventoryCostEntry, at: string): number | null {
  return inventoryCostAt(entry.currentCost, entry.changes, at);
}

function lookupInventoryCost(
  index: InventoryCostEntry[],
  category: string,
  name: string,
  at: string,
): number | null {
  const key = inventoryKey(category, name);
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

function lineSpendFromInventory(
  amount: number,
  unit: string,
  item: InventoryItem,
  at: string,
  index: InventoryCostEntry[],
  fallbackUnitCost: number | null,
): number {
  const qty = inventoryQuantityDelta(amount, unit, item.unit);
  if (qty == null || !(qty > 0)) return 0;
  const entry = index.find((row) => row.id === item.id);
  const unitCost = (entry ? entryCostAt(entry, at) : null)
    ?? fallbackUnitCost
    ?? lookupInventoryCost(index, item.category, item.name, at);
  if (unitCost == null || !(unitCost >= 0)) return 0;
  return roundMoney(qty * unitCost);
}

function blendIngredientCategory(ingredient: BlendIngredient): string {
  if (ingredient.inventory_category?.trim()) return ingredient.inventory_category.trim();
  if (ingredient.ingredient_type === 'sugar') return 'sugar';
  if (ingredient.ingredient_type === 'color') return 'color';
  if (ingredient.ingredient_type === 'syrup') return 'syrup';
  return 'other';
}

/** Match a blend line to stock for costing — same naming rules as lookupInventoryCost. */
function findInventoryItemForBlendIngredient(
  ingredient: BlendIngredient,
  index: InventoryCostEntry[],
): InventoryItem | null {
  if (ingredient.inventory_item_id != null) {
    return getInventoryItems().find((row) => row.id === ingredient.inventory_item_id) ?? null;
  }

  const category = blendIngredientCategory(ingredient);
  const wanted = ingredient.name.trim().toLowerCase();
  const items = getInventoryItems();
  const inCategory = items.filter(
    (row) => row.category.trim().toLowerCase() === category.toLowerCase(),
  );
  const exact = inCategory.find((row) => row.name.trim().toLowerCase() === wanted);
  if (exact) return exact;
  for (const row of inCategory) {
    const name = row.name.trim().toLowerCase();
    if (!name) continue;
    if (wanted.includes(name) || name.includes(wanted)) return row;
  }

  const key = inventoryKey(category, ingredient.name);
  const entry = index.find((row) => row.key === key);
  if (entry) {
    return items.find((row) => row.id === entry.id) ?? null;
  }
  const prefix = `${category.toLowerCase()}::`;
  for (const costEntry of index) {
    if (!costEntry.key.startsWith(prefix)) continue;
    const itemName = costEntry.key.slice(prefix.length);
    if (!itemName || !(wanted.includes(itemName) || itemName.includes(wanted))) continue;
    const match = items.find((row) => row.id === costEntry.id);
    if (match) return match;
  }

  if (ingredient.ingredient_type === 'flavoring' || ingredient.ingredient_type === 'other') {
    for (const row of items) {
      const name = row.name.trim().toLowerCase();
      if (!name) continue;
      if (wanted.includes(name) || name.includes(wanted)) return row;
    }
  }

  return null;
}

function blendIngredientSpend(
  ingredient: BlendIngredient,
  at: string,
  index: InventoryCostEntry[],
): number {
  if (!(ingredient.amount > 0)) return 0;
  if (ingredient.ingredient_type === 'water' && ingredient.inventory_item_id == null) {
    const waterItem = findInventoryItemForBlendIngredient(ingredient, index);
    if (!waterItem) return 0;
  }

  const item = findInventoryItemForBlendIngredient(ingredient, index);
  if (item) {
    return lineSpendFromInventory(
      ingredient.amount,
      ingredient.unit,
      item,
      at,
      index,
      ingredient.cost_per_unit,
    );
  }

  if (ingredient.cost_per_unit != null && ingredient.cost_per_unit >= 0) {
    return roundMoney(ingredient.amount * ingredient.cost_per_unit);
  }

  return 0;
}

function blendFinished(status: string, executed_at: string | null): boolean {
  return status === 'executed' || status === 'bottled' || status === 'blended' || !!executed_at;
}

export function buildProductionConsumptionInRange(
  range: ReportDateRange,
  index: InventoryCostEntry[],
): { totals: ProductionConsumptionTotals; rows: ProductionConsumptionRow[] } {
  const rows: ProductionConsumptionRow[] = [];
  let blendAdditive = 0;
  let ginBotanical = 0;
  let barrelCooperage = 0;

  for (const blend of getBlendProducts()) {
    if (!blendFinished(blend.status, blend.executed_at)) continue;
    const occurred = blend.executed_at ?? blend.blend_date;
    if (!eventInReportRange(occurred, range)) continue;

    let blendTotal = 0;
    const parts: string[] = [];
    for (const ingredient of getBlendIngredients(blend.id)) {
      if (ingredient.ingredient_type === 'water' && ingredient.inventory_item_id == null) continue;
      const spend = blendIngredientSpend(ingredient, occurred, index);
      if (spend <= 0) continue;
      blendTotal += spend;
      parts.push(ingredient.name);
    }
    if (blendTotal > 0) {
      blendAdditive += blendTotal;
      rows.push({
        group: 'blend',
        label: blend.batch_number,
        detail: blend.product_name ? `Additives · ${blend.product_name}` : 'Blend inventory',
        date: occurred,
        meta: parts.length > 0 ? parts.slice(0, 4).join(', ') : undefined,
        amount: roundMoney(blendTotal),
      });
    }
  }

  const botanicals = queryAll<RunBotanicalRow>(
    `SELECT distillation_run_id, name, inventory_item_id, weight, weight_unit
     FROM distillation_run_botanicals
     ORDER BY distillation_run_id, sort_order, id`,
  );
  const botanicalsByRun = new Map<number, RunBotanicalRow[]>();
  for (const line of botanicals) {
    const list = botanicalsByRun.get(line.distillation_run_id) ?? [];
    list.push(line);
    botanicalsByRun.set(line.distillation_run_id, list);
  }

  for (const run of getDistillationRuns()) {
    if (run.status !== 'complete') continue;
    if (!eventInReportRange(run.run_date, range)) continue;
    const lines = botanicalsByRun.get(run.id) ?? [];
    if (lines.length === 0) continue;

    let runTotal = 0;
    for (const line of lines) {
      if (!(line.weight > 0)) continue;
      let spend = 0;
      if (line.inventory_item_id != null) {
        const item = getInventoryItems().find((row) => row.id === line.inventory_item_id);
        if (item) {
          spend = lineSpendFromInventory(line.weight, line.weight_unit, item, run.run_date, index, null);
        }
      } else if (line.name.trim()) {
        const item = getInventoryItems().find(
          (row) => row.category === 'botanicals' && row.name.toLowerCase() === line.name.trim().toLowerCase(),
        );
        if (item) {
          spend = lineSpendFromInventory(line.weight, line.weight_unit, item, run.run_date, index, null);
        } else {
          const unitCost = lookupInventoryCost(index, 'botanicals', line.name, run.run_date);
          if (unitCost != null) {
            spend = roundMoney(line.weight * unitCost);
          }
        }
      }
      runTotal += spend;
    }
    if (runTotal > 0) {
      ginBotanical += runTotal;
      rows.push({
        group: 'still',
        label: run.batch_number,
        detail: run.gin_recipe_name ? `Gin botanicals · ${run.gin_recipe_name}` : 'Gin botanicals',
        date: run.run_date,
        meta: `${lines.length} botanical line${lines.length === 1 ? '' : 's'}`,
        amount: roundMoney(runTotal),
      });
    }
  }

  const usage = queryAll<UsageLogRow>(
    `SELECT inventory_item_id, delta, created_at, source_kind, source_ref, summary
     FROM inventory_usage_log
     WHERE delta < 0 AND source_kind = 'barrel'
     ORDER BY datetime(created_at) DESC`,
  );
  for (const row of usage) {
    const day = row.created_at.slice(0, 10);
    if (!eventInReportRange(day, range)) continue;
    const item = getInventoryItems().find((entry) => entry.id === row.inventory_item_id);
    if (!item) continue;
    if (item.category.toLowerCase() !== BARREL_STOCK_CATEGORY) continue;
    const qty = Math.abs(row.delta);
    const spend = lineSpendFromInventory(qty, item.unit, item, day, index, null);
    if (spend <= 0) continue;
    barrelCooperage += spend;
    rows.push({
      group: 'overhead',
      label: row.source_ref?.trim() || BARREL_STOCK_ITEM_NAME,
      detail: 'Barrel cooperage',
      date: day,
      meta: row.summary?.trim() || undefined,
      amount: spend,
    });
  }

  blendAdditive = roundMoney(blendAdditive);
  ginBotanical = roundMoney(ginBotanical);
  barrelCooperage = roundMoney(barrelCooperage);

  rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  return {
    totals: {
      blendAdditive,
      ginBotanical,
      barrelCooperage,
      total: roundMoney(blendAdditive + ginBotanical + barrelCooperage),
    },
    rows,
  };
}
