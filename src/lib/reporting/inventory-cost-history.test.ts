import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from '../../db/schema';
import { bindSqlHandle } from '../../db/sql-session';
import {
  DEFAULT_PRODUCTION_COST_SETTINGS,
  getInventoryCostHistory,
  getInventoryItems,
  saveInventoryItem,
} from '../../db/queries';
import { buildProductionCostReport } from './production-costing';
import { inventoryCostAt } from '../inventory-cost-at';
import type { InventoryCostChange } from '../../types';
import type { ReportDateRange } from './period';

const allTime: ReportDateRange = { preset: 'all', label: 'All time', from: null, to: null };
const settings = { ...DEFAULT_PRODUCTION_COST_SETTINGS, water_cost_per_gal: 0 };

let db: Database;

const sugarFields = {
  name: 'Cane sugar',
  category: 'sugar',
  unit: 'lbs',
  quantity: 1000,
  reorder_level: 0,
  notes: '',
  package_size_ml: null,
  density_g_per_ml: null,
  density_reference: '',
  abv: null,
};

function change(previous: number | null, next: number | null, at: string, id = 1): InventoryCostChange {
  return { id, inventory_item_id: 1, previous_cost: previous, new_cost: next, changed_by: 'Ben', changed_at: at };
}

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
});

describe('inventory cost in effect', () => {
  it('uses the current cost when no change was logged', () => {
    expect(inventoryCostAt(0.5, [], '2026-01-01')).toBe(0.5);
  });

  it('uses the replaced cost before a change and the new cost from the change on', () => {
    const changes = [change(0.5, 0.8, '2026-11-10 15:00:00')];
    expect(inventoryCostAt(0.8, changes, '2026-11-09')).toBe(0.5);
    expect(inventoryCostAt(0.8, changes, '2026-11-10T14:00')).toBe(0.5);
    expect(inventoryCostAt(0.8, changes, '2026-11-11')).toBe(0.8);
  });

  it('walks several changes in order', () => {
    const changes = [
      change(null, 0.4, '2026-10-01 12:00:00', 1),
      change(0.4, 0.6, '2026-10-15 12:00:00', 2),
      change(0.6, 0.9, '2026-11-01 12:00:00', 3),
    ];
    expect(inventoryCostAt(0.9, changes, '2026-09-30')).toBeNull();
    expect(inventoryCostAt(0.9, changes, '2026-10-05')).toBe(0.4);
    expect(inventoryCostAt(0.9, changes, '2026-10-20')).toBe(0.6);
    expect(inventoryCostAt(0.9, changes, '2026-11-05')).toBe(0.9);
  });
});

describe('inventory cost log', () => {
  it('logs the first cost and each change, and costs washes at the price of their day', () => {
    saveInventoryItem({ ...sugarFields, cost_per_unit: 0.5 }, undefined, 'Ben');
    const sugar = getInventoryItems().find((item) => item.name === 'Cane sugar')!;
    db.run(`UPDATE inventory_cost_history SET changed_at = '2026-10-01 12:00:00'`);

    saveInventoryItem({ ...sugarFields, cost_per_unit: 0.5, notes: 'no cost change' }, sugar.id, 'Ben');
    expect(getInventoryCostHistory(sugar.id)).toHaveLength(1);

    saveInventoryItem({ ...sugarFields, cost_per_unit: 0.8 }, sugar.id, 'Ana');
    db.run(`UPDATE inventory_cost_history SET changed_at = '2026-11-10 12:00:00' WHERE new_cost = 0.8`);

    const log = getInventoryCostHistory(sugar.id);
    expect(log.map((row) => [row.previous_cost, row.new_cost, row.changed_by])).toEqual([
      [0.5, 0.8, 'Ana'],
      [null, 0.5, 'Ben'],
    ]);

    db.run(`INSERT INTO mash_batches (batch_number, recipe_name, grain_type, grain_lbs, water_gal, start_date)
            VALUES ('W-OLD', 'Rum wash', 'sugar', 100, 0, '2026-11-05'),
                   ('W-NEW', 'Rum wash', 'sugar', 100, 0, '2026-11-12')`);
    const report = buildProductionCostReport(allTime, settings);
    const cost = (batch: string) => report.washBatches.find((row) => row.mashBatchNumber === batch)?.materialCost;
    expect(cost('W-OLD')).toBeCloseTo(50);
    expect(cost('W-NEW')).toBeCloseTo(80);
  });
});
