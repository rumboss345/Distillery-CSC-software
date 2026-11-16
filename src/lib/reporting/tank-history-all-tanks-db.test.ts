import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import {
  getHoldingTankContents,
  saveHoldingTankDilution,
  saveHoldingTankOnHand,
} from '../../db/queries';
import { SCHEMA } from '../../db/schema';
import { bindSqlHandle } from '../../db/sql-session';
import { buildLiquidMovements } from './movements';
import type { ReportDateRange } from './period';
import { applyTankBalances, buildTankHistory, type TankHistoryEntry } from './tank-history';

let db: Database;

const ALL: ReportDateRange = { preset: 'all', from: null, to: null, label: 'All' };
const tanks = [
  { id: 1, name: 'HT-A' },
  { id: 2, name: 'HT-B' },
  { id: 3, name: 'Stillage tank' },
  { id: 4, name: 'Collection vessel' },
];

function balancedHistory(tankId: number): TankHistoryEntry[] {
  const current = tanks.map((t) => ({ id: t.id, ...getHoldingTankContents(t.id) }));
  return applyTankBalances(
    buildTankHistory(buildLiquidMovements(ALL, { includePlannedBottlings: true }), tanks, tankId),
    current,
  );
}

/** Tank contents before the oldest entry, walking back from today. */
function startingContents(history: TankHistoryEntry[]): { volume: number; laa: number } {
  const oldest = history[history.length - 1];
  if (!oldest) return { volume: 0, laa: 0 };
  if (oldest.book_volume_gal != null) {
    return { volume: oldest.book_volume_gal, laa: oldest.book_volume_gal * (oldest.book_abv ?? 0) / 100 };
  }
  const sign = oldest.direction === 'in' ? -1 : 1;
  const afterLaa = (oldest.after_volume_gal ?? 0) * (oldest.after_abv ?? 0) / 100;
  return {
    volume: (oldest.after_volume_gal ?? 0) + sign * oldest.volume_gal,
    laa: afterLaa + sign * oldest.laa_gal,
  };
}

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (1, 1, 'HT-A', 'holding_tank', 1000, 'in_use'),
                 (2, 1, 'HT-B', 'holding_tank', 1000, 'in_use'),
                 (3, 1, 'Stillage tank', 'stillage_tank', 1000, 'in_use'),
                 (4, 1, 'Collection vessel', 'collection_vessel', 1000, 'in_use'),
                 (5, 1, 'Carl', 'still', 500, 'in_use')`);

  db.run(`INSERT INTO distillation_runs
            (id, batch_number, run_type, still_name, run_date, status, stillage_volume_gal,
             stillage_holding_tank_equipment_id, alcohol_loss_gal)
          VALUES (1, 'D-1', 'wash', 'Carl', '2026-10-01', 'complete', 200, 3, 3)`);
  db.run(`INSERT INTO distillation_cuts (distillation_run_id, cut_type, start_time, volume_gal, abv, holding_tank_equipment_id)
          VALUES (1, 'hearts', '2026-10-01 10:00:00', 100, 70, 1),
                 (1, 'tails', '2026-10-01 10:30:00', 30, 40, 4)`);

  db.run(`INSERT INTO distillation_runs (id, batch_number, run_type, still_name, run_date, status, charge_volume_gal, charge_abv)
          VALUES (2, 'D-2', 'low_wines', 'Carl', '2026-10-02', 'planned', 999, 70)`);
  db.run(`INSERT INTO distillation_run_tank_sources (distillation_run_id, holding_tank_equipment_id, volume_gal, abv)
          VALUES (2, 2, 999, 70)`);
  db.run(`INSERT INTO distillation_cuts (distillation_run_id, cut_type, start_time, volume_gal, abv, holding_tank_equipment_id)
          VALUES (2, 'hearts', '2026-10-02 09:00:00', 10, 50, 1)`);

  db.run(`INSERT INTO holding_tank_transfers
            (id, spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, created_at)
          VALUES (1, 'high_wines', 1, 2, 40, 70, '2026-10-03', '2026-10-03 09:00:00')`);

  db.run(`INSERT INTO distillation_runs
            (id, batch_number, run_type, still_name, run_date, status, source_holding_tank_equipment_id, charge_volume_gal, charge_abv)
          VALUES (3, 'D-3', 'low_wines', 'Carl', '2026-10-04', 'running', 2, 20, 70)`);
  db.run(`INSERT INTO distillation_runs
            (id, batch_number, run_type, still_name, run_date, status, source_holding_tank_equipment_id,
             charge_volume_gal, charge_abv, proof_water_gal, proof_spirit_gal, proof_spirit_abv)
          VALUES (4, 'D-4', 'low_wines', 'Carl', '2026-10-05', 'complete', 4, 25, 24, 10, 15, 40)`);

  db.run(`INSERT INTO blend_products
            (id, batch_number, product_name, blend_date, status, final_volume_gal, final_abv,
             output_holding_tank_equipment_id, executed_at)
          VALUES (1, 'BL-1', 'Gold', '2026-10-06', 'executed', 30, 45, 2, '2026-10-06 10:00:00')`);
  db.run(`INSERT INTO blend_spirit_sources (blend_product_id, holding_tank_equipment_id, volume_gal, abv)
          VALUES (1, 1, 20, 70)`);
  db.run(`INSERT INTO blend_products
            (id, batch_number, product_name, blend_date, status, final_volume_gal, final_abv,
             source_holding_tank_equipment_id, base_spirit_volume_gal, base_spirit_abv, executed_at)
          VALUES (2, 'BL-2', 'Silver', '2026-10-07', 'executed', 12, 50, 1, 10, 70, '2026-10-07 10:00:00')`);

  db.run(`INSERT INTO bottling_runs
            (id, batch_number, bottling_date, product_name, final_abv, source_abv, status,
             source_holding_tank_equipment_id, source_volume_gal)
          VALUES (1, 'BT-1', '2026-10-08', 'Gold', 45, 45, 'complete', 2, 25)`);
  db.run(`INSERT INTO bottling_run_returns (bottling_run_id, holding_tank_equipment_id, volume_gal)
          VALUES (1, 1, 3)`);
  db.run(`INSERT INTO bottling_runs
            (id, batch_number, bottling_date, product_name, final_abv, source_abv, status,
             source_holding_tank_equipment_id, source_volume_gal, created_at)
          VALUES (2, 'BT-2', '2026-12-01', 'Gold', 40, 70, 'planned', 1, 5, '2026-10-09 08:00:00')`);

  db.run(`INSERT INTO barrels (id, barrel_number, fill_date) VALUES (1, 'B-1', '2026-10-10')`);
  db.run(`INSERT INTO barrel_fills (barrel_id, source_holding_tank_equipment_id, volume_gal, abv, fill_date)
          VALUES (1, 1, 10, 70, '2026-10-10')`);

  saveHoldingTankDilution({ tankEquipmentId: 2, waterGal: 5, recordedAt: '2026-10-11', changedBy: 'Ana' });

  db.run(`INSERT INTO holding_tank_opening_balances
            (tank_equipment_id, volume_gal, alcohol_gal, measured_volume_gal, measured_abv, recorded_at)
          VALUES (4, -1, -0.4, 14, 40, '2026-10-12')`);

  const a = getHoldingTankContents(1);
  saveHoldingTankOnHand({
    tankEquipmentId: 1, volumeGal: a.volume_gal - 2, abv: 69, recordedAt: '2026-11-14',
    notes: 'Dipped tank, reading lower', changedBy: 'Ben', liquidLabel: 'Low Wine Run · Hearts',
  });
  const b = getHoldingTankContents(2);
  saveHoldingTankOnHand({
    tankEquipmentId: 2, volumeGal: b.volume_gal, abv: b.abv - 1, recordedAt: '2026-11-14',
    notes: 'Hydrometer reading lower', changedBy: 'Ben', liquidLabel: 'Blended · Gold',
  });

  db.run(`INSERT INTO holding_tank_transfers
            (id, spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, created_at)
          VALUES (2, 'high_wines', 2, 1, 5, 40, '2099-01-02', '2099-01-02 09:00:00')`);
});

describe('every tank history adds up to what the tank holds', () => {
  for (const tank of tanks) {
    it(`${tank.name}: starts from empty and ends at today's reading with nothing unexplained`, () => {
      const history = balancedHistory(tank.id);
      expect(history.length).toBeGreaterThan(0);
      expect(history.filter((e) => e.unexplained_out_gal != null)).toEqual([]);
      const start = startingContents(history);
      expect(start.volume).toBeCloseTo(0, 2);
      expect(start.laa).toBeCloseTo(0, 2);

      const now = getHoldingTankContents(tank.id);
      expect(history[0].after_volume_gal).toBeCloseTo(now.volume_gal, 2);
    });
  }

  it('leaves planned runs out because they have not touched a tank', () => {
    const movements = buildLiquidMovements(ALL, { includePlannedBottlings: true });
    expect(movements.some((m) => m.batch_ref === 'D-2')).toBe(false);
  });

  it('lists every kind of in and out', () => {
    const kinds = new Set(buildLiquidMovements(ALL, { includePlannedBottlings: true }).map((m) => m.movement_type));
    expect([...kinds].sort()).toEqual([
      'blend_draw', 'blend_output', 'bottling', 'bottling_planned', 'bottling_return', 'barrel_fill',
      'distillation_cut', 'still_charge', 'stillage', 'tank_dilution', 'tank_transfer', 'tank_volume_set',
    ].sort());
  });
});
