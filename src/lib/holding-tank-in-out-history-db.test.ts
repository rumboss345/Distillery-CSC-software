import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { getHoldingTankInOutHistory } from '../db/queries';
import { SCHEMA } from '../db/schema';
import { bindSqlHandle } from '../db/sql-session';

let db: Database;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (1, 1, 'Hearts jug', 'collection_vessel', 50, 'in_use'),
                 (2, 1, 'Carl', 'pot_still', 200, 'in_use')`);
  db.run(`INSERT INTO distillation_runs (id, batch_number, run_type, still_name, run_date, status)
          VALUES (1, 'D-1', 'wash', 'Carl', '2026-10-01', 'complete')`);
  db.run(`INSERT INTO distillation_cuts (distillation_run_id, cut_type, start_time, volume_gal, abv, holding_tank_equipment_id)
          VALUES (1, 'hearts', '2026-10-01 10:00:00', 12, 65, 1)`);
});

describe('getHoldingTankInOutHistory', () => {
  it('lists ins and outs for collection vessels', () => {
    const rows = getHoldingTankInOutHistory(1, 10);
    expect(rows.some((row) => row.direction === 'in')).toBe(true);
    expect(rows[0]?.summary).toMatch(/In/);
  });
});