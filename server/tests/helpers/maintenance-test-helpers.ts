/**
 * Phase 1L Equipment Maintenance — test helpers.
 */
import { Database } from 'sql.js/dist/sql-wasm.js';
import { MAINTENANCE_FLOOR_EQUIPMENT_COLUMNS } from '../../../src/db/maintenance-schema';
import { createMaterialTestDb } from './material-test-db';

export async function createMaintenanceTestDb(includeProduction = false): Promise<Database> {
  const db = await createMaterialTestDb(includeProduction);
  db.run(`CREATE TABLE IF NOT EXISTS floor_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Production Floor',
    width_ft REAL NOT NULL DEFAULT 80,
    height_ft REAL NOT NULL DEFAULT 60,
    notes TEXT NOT NULL DEFAULT ''
  )`);
  db.run(`INSERT OR IGNORE INTO floor_plans (id, name) VALUES (1, 'Production Floor')`);
  db.run(`CREATE TABLE IF NOT EXISTS floor_equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_plan_id INTEGER NOT NULL DEFAULT 1 REFERENCES floor_plans(id),
    name TEXT NOT NULL,
    equipment_type TEXT NOT NULL DEFAULT 'fermenter',
    pos_x_ft REAL NOT NULL DEFAULT 4,
    pos_y_ft REAL NOT NULL DEFAULT 4,
    width_ft REAL NOT NULL DEFAULT 8,
    depth_ft REAL NOT NULL DEFAULT 8,
    capacity_gal REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'empty',
    linked_mash_batch_id INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`INSERT INTO floor_equipment (name, equipment_type, capacity_gal, status) VALUES ('Pot Still #1', 'pot_still', 200, 'empty')`);
  db.run(`INSERT INTO floor_equipment (name, equipment_type, capacity_gal, status) VALUES ('Fermenter #1', 'fermenter', 1000, 'empty')`);
  for (const col of MAINTENANCE_FLOOR_EQUIPMENT_COLUMNS) {
    try { db.run(col.ddl); } catch { /* column may exist */ }
  }
  return db;
}

export function seedEquipmentId(db: Database): number {
  return db.exec('SELECT id FROM floor_equipment ORDER BY id LIMIT 1')[0]?.values[0]?.[0] as number;
}
