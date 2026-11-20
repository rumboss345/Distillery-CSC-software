import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from './schema';
import { bindSqlHandle } from './sql-session';
import { saveFloorEquipment } from './queries';

let db: Database;

const baseEquipment = (name: string, pos_x_ft: number) => ({
  floor_plan_id: 1,
  name,
  equipment_type: 'holding_tank' as const,
  icon: '',
  pos_x_ft,
  pos_y_ft: 0,
  width_ft: 8,
  depth_ft: 8,
  capacity_gal: 500,
  status: 'empty' as const,
  linked_mash_batch_id: null,
  notes: '',
  maintenance_status: null,
  maintenance_notes: '',
});

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Floor')`);
});

describe('floor equipment names', () => {
  it('rejects an exact duplicate name', () => {
    saveFloorEquipment(baseEquipment('Low Wines Tank', 0));
    expect(() => saveFloorEquipment(baseEquipment('Low Wines Tank', 1))).toThrow(/already exists/i);
  });

  it('allows the same words with different capitalization', () => {
    saveFloorEquipment(baseEquipment('Hearts Tank', 0));
    expect(() => saveFloorEquipment(baseEquipment('hearts tank', 1))).not.toThrow();
  });
});