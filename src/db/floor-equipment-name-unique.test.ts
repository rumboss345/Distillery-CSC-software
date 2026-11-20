import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from './schema';
import { bindSqlHandle } from './sql-session';
import { saveFloorEquipment } from './queries';

let db: Database;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
});

describe('floor equipment names', () => {
  it('rejects a duplicate name regardless of capitalization', () => {
    saveFloorEquipment({
      floor_plan_id: 1,
      name: 'Low Wines Tank',
      equipment_type: 'holding_tank',
      icon: '',
      pos_x_ft: 0,
      pos_y_ft: 0,
      width_ft: 8,
      depth_ft: 8,
      capacity_gal: 500,
      status: 'empty',
      linked_mash_batch_id: null,
      notes: '',
      maintenance_status: null,
      maintenance_notes: '',
    });
    expect(() => saveFloorEquipment({
      floor_plan_id: 1,
      name: 'low wines tank',
      equipment_type: 'holding_tank',
      icon: '',
      pos_x_ft: 1,
      pos_y_ft: 1,
      width_ft: 8,
      depth_ft: 8,
      capacity_gal: 500,
      status: 'empty',
      linked_mash_batch_id: null,
      notes: '',
      maintenance_status: null,
      maintenance_notes: '',
    })).toThrow(/not case-sensitive/i);
  });
});