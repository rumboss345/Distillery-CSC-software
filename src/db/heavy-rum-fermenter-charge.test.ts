import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from './schema';
import { bindSqlHandle } from './sql-session';
import {
  getFloorEquipmentWithContext,
  getMashFermenterAssignments,
  saveDistillationRun,
  saveFermenterWashTransfer,
} from './queries';

let db: Database;
let SQL: Awaited<ReturnType<typeof initSqlJs>>;

function seedHeavyRumFixtures() {
  db.run(`INSERT INTO floor_plans (id, name, width_ft, height_ft) VALUES (1, 'Floor', 100, 80)`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (6, 1, 'Fermenter 6', 'fermenter', 500, 'empty'),
                 (7, 1, 'Fermenter 7', 'fermenter', 500, 'empty'),
                 (10, 1, 'Rum Still', 'pot_still', 300, 'empty')`);
  db.run(`INSERT INTO mash_batches (id, batch_number, recipe_name, grain_type, grain_lbs, water_gal, start_date, status)
          VALUES (1, 'W-2026-006', 'Heavy Wash', 'molasses', 100, 400, '2026-11-20', 'fermenting')`);
  db.run(`INSERT INTO mash_fermenter_assignments (mash_batch_id, floor_equipment_id, volume_gal, status)
          VALUES (1, 6, 400, 'fermenting')`);
}

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  seedHeavyRumFixtures();
});

describe('heavy rum fermenter charge', () => {
  it('deducts charge volume on the fermenter when a run goes running', () => {
    saveDistillationRun({
      batch_number: 'D-2026-034',
      run_type: 'heavy_rum',
      source_mash_batch_id: 1,
      source_fermenter_equipment_id: 6,
      source_holding_tank_equipment_id: null,
      dest_holding_tank_equipment_id: null,
      still_name: 'Rum Still',
      run_date: '2026-11-20',
      charge_volume_gal: 120,
      charge_abv: 8.3,
      proof_spirit_gal: null,
      proof_spirit_abv: null,
      proof_water_gal: 0,
      proof_place: null,
      stillage_volume_gal: null,
      stillage_discarded: 0,
      stillage_holding_tank_equipment_id: null,
      status: 'running',
      assigned_user_id: null,
      assigned_user_name: 'Operator',
      notes: '',
      gin_recipe_id: null,
      gin_recipe_name: '',
    });
    const assignment = getMashFermenterAssignments(1).find((a) => a.floor_equipment_id === 6);
    expect(assignment?.volume_gal).toBeCloseTo(280, 1);
    const fermenter = getFloorEquipmentWithContext().find((eq) => eq.id === 6);
    expect(fermenter?.active_volume_gal).toBeCloseTo(280, 1);
  });

  it('deducts from the fermenter that holds the wash after a transfer', () => {
    saveFermenterWashTransfer({
      sourceEquipmentId: 6,
      destEquipmentId: 7,
      discarded: false,
      volumeGal: 400,
      transferDate: '2026-11-20',
      notes: '',
      changedBy: 'Operator',
    });
    saveDistillationRun({
      batch_number: 'D-TRANSFER',
      run_type: 'heavy_rum',
      source_mash_batch_id: 1,
      source_fermenter_equipment_id: 6,
      source_holding_tank_equipment_id: null,
      dest_holding_tank_equipment_id: null,
      still_name: 'Rum Still',
      run_date: '2026-11-20',
      charge_volume_gal: 80,
      charge_abv: 8.3,
      proof_spirit_gal: null,
      proof_spirit_abv: null,
      proof_water_gal: 0,
      proof_place: null,
      stillage_volume_gal: null,
      stillage_discarded: 0,
      stillage_holding_tank_equipment_id: null,
      status: 'running',
      assigned_user_id: null,
      assigned_user_name: 'Operator',
      notes: '',
      gin_recipe_id: null,
      gin_recipe_name: '',
    });
    const f6 = getMashFermenterAssignments(1).find((a) => a.floor_equipment_id === 6);
    expect(f6?.volume_gal ?? 0).toBeLessThanOrEqual(0.01);
    const f7 = getMashFermenterAssignments(1).find((a) => a.floor_equipment_id === 7);
    expect(f7?.volume_gal).toBeCloseTo(320, 1);
    const fermenterSeven = getFloorEquipmentWithContext().find((eq) => eq.id === 7);
    expect(fermenterSeven?.active_volume_gal).toBeCloseTo(320, 1);
  });
});