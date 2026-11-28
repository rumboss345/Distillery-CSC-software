import { queryAll } from '../../db/database';
import {
  getBlendIngredients,
  getBlendProducts,
  getDistillationRuns,
  getInventoryItems,
} from '../../db/queries';
import { BARREL_STOCK_CATEGORY, BARREL_STOCK_ITEM_NAME } from '../barrel-inventory';
import type { BlendIngredient } from '../../types';
import { eventInReportRange, type ReportDateRange } from './period';
import {
  findInventoryItemForCosting,
  spendFromInventoryLine,
  spendFromInventoryLookup,
  type InventoryCostEntry,
} from './inventory-cost-spend';

export type { InventoryCostEntry };

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

function blendIngredientCategory(ingredient: BlendIngredient): string {
  if (ingredient.inventory_category?.trim()) return ingredient.inventory_category.trim();
  if (ingredient.ingredient_type === 'sugar') return 'sugar';
  if (ingredient.ingredient_type === 'color') return 'color';
  if (ingredient.ingredient_type === 'syrup') return 'syrup';
  return 'other';
}

function blendIngredientSpend(
  ingredient: BlendIngredient,
  at: string,
  index: InventoryCostEntry[],
): number {
  if (!(ingredient.amount > 0)) return 0;
  if (ingredient.ingredient_type === 'water' && ingredient.inventory_item_id == null) {
    const waterItem = findInventoryItemForCosting(
      { category: blendIngredientCategory(ingredient), name: ingredient.name },
      index,
    );
    if (!waterItem) return 0;
  }

  return spendFromInventoryLookup(
    ingredient.amount,
    ingredient.unit,
    {
      inventoryItemId: ingredient.inventory_item_id,
      category: blendIngredientCategory(ingredient),
      name: ingredient.name,
    },
    at,
    index,
    ingredient.cost_per_unit,
  );
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
      if (ingredient.ingredient_type === 'water' && ingredient.inventory_item_id == null) {
        const waterStocked = findInventoryItemForCosting(
          { category: blendIngredientCategory(ingredient), name: ingredient.name },
          index,
        );
        if (!waterStocked) continue;
      }
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
      const spend = spendFromInventoryLookup(
        line.weight,
        line.weight_unit,
        {
          inventoryItemId: line.inventory_item_id,
          category: 'botanicals',
          name: line.name,
        },
        run.run_date,
        index,
      );
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
    const spend = spendFromInventoryLine(qty, item.unit, item, day, index, null);
    if (spend <= 0) continue;
    barrelCooperage += spend;
    rows.push({
      group: 'overhead',
      label: item.name === BARREL_STOCK_ITEM_NAME ? 'Barrel cooperage' : item.name,
      detail: row.summary?.trim() || row.source_ref || 'Barrel fill',
      date: day,
      meta: item.unit ? `${roundMoney(qty)} ${item.unit}` : undefined,
      amount: roundMoney(spend),
    });
  }

  const total = roundMoney(blendAdditive + ginBotanical + barrelCooperage);
  return {
    totals: {
      blendAdditive: roundMoney(blendAdditive),
      ginBotanical: roundMoney(ginBotanical),
      barrelCooperage: roundMoney(barrelCooperage),
      total,
    },
    rows: rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
  };
}