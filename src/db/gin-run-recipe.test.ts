import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from './schema';
import { bindSqlHandle } from './sql-session';
import { getDistillationRuns, saveDistillationRun } from './queries';
import type { GinBotanicalInput } from '../types';

let db: Database;

const botanicals: GinBotanicalInput[] = [{
  name: 'Juniper',
  inventory_item_id: 1,
  amount: 0,
  weight: 100,
  weight_unit: 'g',
  place: 'basket',
}];

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO gin_recipes (id, name) VALUES (7, 'House Gin')`);
  db.run(`INSERT INTO inventory_items (id, name, category, unit, quantity) VALUES (1, 'Juniper', 'botanicals', 'g', 1000)`);
});

describe('gin run recipe link', () => {
  it('stores and returns the saved gin recipe on the run list', () => {
    const runId = saveDistillationRun({
      batch_number: 'G-TEST',
      run_type: 'gin',
      source_mash_batch_id: null,
      source_fermenter_equipment_id: null,
      source_holding_tank_equipment_id: null,
      dest_holding_tank_equipment_id: null,
      still_name: 'Carl',
      run_date: '2026-11-17',
      charge_volume_gal: 50,
      charge_abv: 45,
      stillage_volume_gal: null,
      stillage_discarded: 0,
      stillage_holding_tank_equipment_id: null,
      status: 'planned',
      assigned_user_id: null,
      assigned_user_name: null,
      notes: '',
      gin_recipe_id: 7,
      gin_recipe_name: 'House Gin',
    }, undefined, botanicals);

    const saved = getDistillationRuns().find((run) => run.id === runId);
    expect(saved?.gin_recipe_id).toBe(7);
    expect(saved?.gin_recipe_name).toBe('House Gin');
    expect(saved?.status).toBe('planned');
  });

  it('drops a missing recipe id but keeps the name (production database mismatch)', () => {
    const runId = saveDistillationRun({
      batch_number: 'G-BAD-ID',
      run_type: 'gin',
      source_mash_batch_id: null,
      source_fermenter_equipment_id: null,
      source_holding_tank_equipment_id: null,
      dest_holding_tank_equipment_id: null,
      still_name: 'Carl',
      run_date: '2026-11-17',
      charge_volume_gal: 50,
      charge_abv: 45,
      stillage_volume_gal: null,
      stillage_discarded: 0,
      stillage_holding_tank_equipment_id: null,
      status: 'planned',
      assigned_user_id: null,
      assigned_user_name: null,
      notes: '',
      gin_recipe_id: 999,
      gin_recipe_name: 'House Gin',
    }, undefined, botanicals);

    const saved = getDistillationRuns().find((run) => run.id === runId);
    expect(saved?.gin_recipe_id).toBe(7);
    expect(saved?.gin_recipe_name).toBe('House Gin');
  });
});