import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { getHoldingTankContents } from '../../db/queries';
import { SCHEMA } from '../../db/schema';
import { bindSqlHandle } from '../../db/sql-session';
import { buildLiquidMovements } from './movements';
import type { ReportDateRange } from './period';
import { applyTankBalances, buildTankHistory } from './tank-history';

let db: Database;

const ALL: ReportDateRange = { preset: 'all', from: null, to: null, label: 'All' };
const tanks = [
  { id: 1, name: 'TAILS HOPPER' },
  { id: 2, name: 'TAILS STORAGE TANK' },
];

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (1, 1, 'TAILS HOPPER', 'holding_tank', 500, 'in_use'),
                 (2, 1, 'TAILS STORAGE TANK', 'holding_tank', 500, 'in_use'),
                 (3, 1, 'Carl', 'still', 500, 'in_use')`);
  db.run(`INSERT INTO holding_tank_transfers
            (id, spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, created_at)
          VALUES (1, 'low_wines', 1, 2, 298, 58.5, '2026-11-13', '2026-11-13 09:10:00'),
                 (2, 'low_wines', 1, 2, 35, 63.5, '2026-11-14', '2026-11-14 09:17:00')`);
  db.run(`INSERT INTO bottling_runs
            (id, batch_number, bottling_date, product_name, final_abv, source_abv, status,
             source_holding_tank_equipment_id, source_volume_gal, created_at)
          VALUES (1, 'BT-9', '2026-11-20', 'Gold', 40, 58.5, 'planned', 2, 35, '2026-11-13 12:00:00')`);
  db.run(`INSERT INTO distillation_runs (id, batch_number, run_type, still_name, run_date, status, assigned_user_name, charge_volume_gal, charge_abv)
          VALUES (1, 'D-2026-026', 'low_wines', 'Carl', '2026-11-14', 'running', 'Emmanuel', 298, 58.5)`);
  db.run(`INSERT INTO distillation_run_tank_sources (distillation_run_id, holding_tank_equipment_id, volume_gal, abv)
          VALUES (1, 2, 298, 58.5)`);
  db.run(`INSERT INTO distillation_cuts (distillation_run_id, cut_type, start_time, volume_gal, abv)
          VALUES (1, 'heads', '2026-11-14 10:05:00', 2, 80)`);
});

describe('tank history with a planned bottling and a same-day charge', () => {
  it('shows the gallons held for a planned bottling so the tank adds up', () => {
    expect(getHoldingTankContents(2).volume_gal).toBe(0);
    const history = applyTankBalances(
      buildTankHistory(buildLiquidMovements(ALL, { includePlannedBottlings: true }), tanks, 2),
      [{ id: 2, volume_gal: 0, abv: null }],
    );
    expect(history.map((e) => [e.movement_label, e.direction, e.volume_gal, e.after_volume_gal])).toEqual([
      ['Still charge', 'out', 298, 0],
      ['Tank transfer', 'in', 35, 298],
      ['Planned bottling', 'out', 35, 263],
      ['Tank transfer', 'in', 298, 298],
    ]);
    expect(history.some((e) => e.unexplained_out_gal != null)).toBe(false);
  });

  it('places the charge at its first cut time and leaves planned bottlings off the Movements report', () => {
    const movements = buildLiquidMovements(ALL);
    expect(movements.find((m) => m.movement_type === 'still_charge')?.occurred_at).toBe('2026-11-14 10:05:00');
    expect(movements.some((m) => m.movement_type === 'bottling_planned')).toBe(false);
  });

  it('flags gallons that left a tank with no record', () => {
    const withoutPlanned = applyTankBalances(
      buildTankHistory(buildLiquidMovements(ALL), tanks, 2),
      [{ id: 2, volume_gal: 0, abv: null }],
    );
    const flagged = withoutPlanned.filter((e) => e.unexplained_out_gal != null);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ movement_label: 'Tank transfer', volume_gal: 298, unexplained_out_gal: 35 });
  });
});
