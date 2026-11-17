import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from '../../db/schema';
import { bindSqlHandle } from '../../db/sql-session';
import { dashboardPeriodMetrics } from './period-metrics';
import { resolveReportPeriod } from '../reporting/period';

let db: Database;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO mash_batches (id, batch_number, recipe_name, grain_type, grain_lbs, water_gal, start_date, status)
          VALUES (1, 'W-1', 'Rum', 'sugar', 100, 200, '2026-10-01', 'complete')`);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (1, 1, 'Tank', 'holding_tank', 500, 'in_use')`);
  db.run(`INSERT INTO distillation_runs (id, batch_number, run_type, still_name, run_date, status, source_mash_batch_id)
          VALUES (10, 'D-OCT', 'rum', 'Still', '2026-10-15', 'complete', 1),
                 (11, 'D-NOV', 'rum', 'Still', '2026-11-15', 'complete', 1)`);
  db.run(`INSERT INTO distillation_cuts (distillation_run_id, cut_type, start_time, volume_gal, abv)
          VALUES (10, 'hearts', '2026-10-15', 50, 80),
                 (11, 'hearts', '2026-11-15', 70, 80)`);
  db.run(`INSERT INTO bottling_runs (id, batch_number, bottling_date, bottle_count, final_abv, product_name, status)
          VALUES (20, 'B-OCT', '2026-10-20', 100, 40, 'Gold', 'complete'),
                 (21, 'B-NOV', '2026-11-20', 200, 40, 'Gold', 'complete')`);
  db.run(`INSERT INTO bottling_run_lines (bottling_run_id, bottle_size_ml, bottle_count, sort_order)
          VALUES (20, 750, 100, 0), (21, 750, 200, 0)`);
});

describe('dashboardPeriodMetrics', () => {
  it('changes hearts and bottle counts when the period changes', () => {
    const october = resolveReportPeriod('custom', '2026-10-01', '2026-10-31');
    const november = resolveReportPeriod('custom', '2026-11-01', '2026-11-30');
    expect(dashboardPeriodMetrics(october).totalHeartsGal).toBeCloseTo(50);
    expect(dashboardPeriodMetrics(november).totalHeartsGal).toBeCloseTo(70);
    expect(dashboardPeriodMetrics(october).bottleCount).toBe(100);
    expect(dashboardPeriodMetrics(november).bottleCount).toBe(200);
  });
});