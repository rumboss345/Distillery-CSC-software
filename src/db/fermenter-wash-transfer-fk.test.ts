import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { SCHEMA } from './schema';
import { bindSqlHandle } from './sql-session';
import {
  clearOrphanFermenterWashTransfers,
  deleteMashBatch,
  saveFermenterWashTransfer,
} from './queries';
import { queryOne, runQuery } from './sql-session';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  db = new SQL.Database();
  db.run(SCHEMA);
  bindSqlHandle(() => db as never);
  db.run(`INSERT INTO floor_plans (id, name, width_ft, height_ft) VALUES (1, 'Floor', 100, 80)`);
  db.run(`INSERT INTO floor_equipment (id, floor_plan_id, name, equipment_type, capacity_gal, status)
          VALUES (6, 1, 'Fermenter 6', 'fermenter', 500, 'empty'),
                 (7, 1, 'Fermenter 7', 'fermenter', 500, 'empty')`);
  db.run(`INSERT INTO inventory_items (id, name, category, unit, quantity) VALUES (1, 'sugar', 'sugar', 'lbs', 500)`);
  db.run(`INSERT INTO mash_batches (id, batch_number, recipe_name, grain_type, grain_lbs, water_gal, start_date, status, grain_inventory_item_id)
          VALUES (1, 'W-FK', 'Wash', 'sugar', 100, 400, '2026-11-21', 'fermenting', 1)`);
  db.run(`INSERT INTO mash_fermenter_assignments (mash_batch_id, floor_equipment_id, volume_gal, status)
          VALUES (1, 6, 200, 'fermenting')`);
});

describe('fermenter wash transfer mash batch FK', () => {
  it('removes transfer history when a wash batch is deleted', () => {
    saveFermenterWashTransfer({
      sourceEquipmentId: 6,
      destEquipmentId: 7,
      discarded: false,
      volumeGal: 50,
      transferDate: '2026-11-21',
      notes: '',
      changedBy: 'Test',
    });
  expect(
    queryOne<{ n: number }>(
      'SELECT COUNT(*) AS n FROM fermenter_wash_transfers WHERE mash_batch_id = 1',
    )?.n,
  ).toBe(1);
    deleteMashBatch(1);
    expect(
      queryOne<{ n: number }>(
        'SELECT COUNT(*) AS n FROM fermenter_wash_transfers WHERE mash_batch_id = 1',
      )?.n,
    ).toBe(0);
  });

  it('clears orphan transfer rows that reference a missing wash', () => {
    runQuery(
      `INSERT INTO fermenter_wash_transfers
        (mash_batch_id, batch_number, source_fermenter_equipment_id, dest_fermenter_equipment_id,
         volume_gal, transfer_date, notes, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [999, 'GHOST', 6, 7, 10, '2026-11-21', '', 'Test'],
    );
    clearOrphanFermenterWashTransfers();
    expect(queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM fermenter_wash_transfers')?.n).toBe(0);
  });
});