import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from '../../db/schema';
import { bindSqlHandle } from '../../db/sql-session';
import { buildLiquidMovements } from './movements';
import type { ReportDateRange } from './period';
import { getHoldingTankContents } from '../../db/queries';
import { applyTankBalances, buildTankHistory } from './tank-history';

let db: Database;

const ALL: ReportDateRange = { preset: 'all', from: null, to: null, label: 'All' };
const tanks = [
  { id: 1, name: 'HT1' },
  { id: 2, name: 'HT2' },
  { id: 3, name: 'Stillage Tank' },
];

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (1, 1, 'HT1', 'holding_tank', 500, 'in_use'),
                 (2, 1, 'HT2', 'holding_tank', 500, 'in_use'),
                 (3, 1, 'Stillage Tank', 'stillage_tank', 500, 'in_use')`);
  db.run(`INSERT INTO distillation_runs
            (id, batch_number, run_type, still_name, run_date, status, assigned_user_name,
             stillage_volume_gal, stillage_holding_tank_equipment_id)
          VALUES (1, 'DR-1', 'low_wines', 'Carl', '2026-11-02', 'complete', 'Ana', 80, 3)`);
  db.run(`INSERT INTO distillation_cuts (id, distillation_run_id, cut_type, volume_gal, abv, start_time, holding_tank_equipment_id)
          VALUES (1, 1, 'hearts', 40, 70, '2026-11-02 10:00:00', 1)`);
  db.run(`INSERT INTO holding_tank_transfers
            (id, spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, liquid_label, created_at)
          VALUES (1, 'high_wines', 1, 2, 25, 70, '2026-11-03', '', '2026-11-03 09:00:00')`);
  db.run(`INSERT INTO bottling_runs (id, batch_number, bottling_date, product_name, final_abv, source_abv, source_holding_tank_equipment_id, source_volume_gal)
          VALUES (1, 'BT-1', '2026-11-04', 'Silver', 40, 70, 2, 20)`);
  db.run(`INSERT INTO bottling_run_returns (id, bottling_run_id, holding_tank_equipment_id, volume_gal)
          VALUES (1, 1, 1, 2)`);
  db.run(`INSERT INTO holding_tank_volume_variances
            (id, tank_equipment_id, book_volume_gal, book_abv, set_volume_gal, set_abv, variance_gal, recorded_at, notes, changed_by, created_at)
          VALUES (1, 2, 5, 70, 4, 70, -1, '2026-11-05', 'Dipped', 'Ben', '2026-11-05 08:00:00')`);
  db.run(`INSERT INTO holding_tank_opening_balances
            (tank_equipment_id, volume_gal, alcohol_gal, measured_volume_gal, measured_abv, recorded_at)
          VALUES (2, -1, -0.7, 4, 70, '2026-11-05')`);
});

describe('tank history from production records', () => {
  it('lists every in and out for a tank, newest first', () => {
    const ht1 = buildTankHistory(buildLiquidMovements(ALL), tanks, 1);
    expect(ht1.map((e) => [e.direction, e.counterpart, e.what, e.volume_gal])).toEqual([
      ['in', 'Bottling BT-1', 'Silver', 2],
      ['out', 'HT2', 'High wines', 25],
      ['in', 'Carl', 'Rum Run · Hearts', 40],
    ]);
  });

  it('shows draws, volume corrections and stillage on the right tanks', () => {
    const movements = buildLiquidMovements(ALL);
    const ht2 = buildTankHistory(movements, tanks, 2);
    expect(ht2.map((e) => [e.direction, e.counterpart, e.movement_label])).toEqual([
      ['out', 'Volume set', 'Volume set'],
      ['out', 'Bottling BT-1', 'Bottling draw'],
      ['in', 'HT1', 'Tank transfer'],
    ]);
    expect(ht2[0].user_label).toBe('Ben');

    const stillage = buildTankHistory(movements, tanks, 3);
    expect(stillage).toHaveLength(1);
    expect(stillage[0]).toMatchObject({ direction: 'in', counterpart: 'Carl', volume_gal: 80 });
  });

  it('walks each tank total back from what the tank holds now', () => {
    const current = tanks.map((t) => ({ id: t.id, ...getHoldingTankContents(t.id) }));
    const ht1 = applyTankBalances(buildTankHistory(buildLiquidMovements(ALL), tanks, 1), current);
    expect(current[0].volume_gal).toBeCloseTo(17);
    expect(ht1.map((e) => e.after_volume_gal)).toEqual([17, 15, 40]);
    expect(ht1[2].after_abv).toBe(70);

    const ht2 = applyTankBalances(buildTankHistory(buildLiquidMovements(ALL), tanks, 2), current);
    expect(ht2.map((e) => [e.after_volume_gal, e.after_abv])).toEqual([
      [4, 70],
      [5, 70],
      [25, 70],
    ]);
  });

  it('respects the report period', () => {
    const range: ReportDateRange = { preset: 'custom', from: '2026-11-03', to: '2026-11-03', label: 'Nov 3' };
    const entries = buildTankHistory(buildLiquidMovements(range), tanks);
    expect(entries.map((e) => [e.tank_name, e.direction])).toEqual([
      ['HT1', 'out'],
      ['HT2', 'in'],
    ]);
  });
});
