import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

async function getSql() {
  if (!sqlPromise) {
    const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    sqlPromise = initSqlJs({ locateFile: () => wasmPath });
  }
  return sqlPromise;
}

/** Minimal browser schema slice for migration integration tests. */
const MINIMAL_SCHEMA = `
CREATE TABLE floor_plans (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  width_ft REAL NOT NULL DEFAULT 80,
  height_ft REAL NOT NULL DEFAULT 60,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE floor_equipment (
  id INTEGER PRIMARY KEY,
  floor_plan_id INTEGER NOT NULL DEFAULT 1,
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
);
CREATE TABLE mash_batches (
  id INTEGER PRIMARY KEY,
  batch_number TEXT NOT NULL UNIQUE,
  recipe_name TEXT NOT NULL,
  grain_type TEXT NOT NULL,
  grain_lbs REAL NOT NULL,
  water_gal REAL NOT NULL,
  yeast_strain TEXT NOT NULL DEFAULT '',
  yeast_lbs REAL NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  target_brix REAL,
  actual_brix REAL,
  target_final_brix REAL,
  actual_final_brix REAL,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE inventory_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE inventory_items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  unit TEXT NOT NULL DEFAULT 'each',
  quantity REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export async function createTestBrowserDatabase(): Promise<Database> {
  const SQL = await getSql();
  const db = new SQL.Database();
  db.run(MINIMAL_SCHEMA);
  db.run(`INSERT INTO floor_plans (id, name) VALUES (1, 'Test Floor')`);
  db.run(`
    INSERT INTO mash_batches
      (id, batch_number, recipe_name, grain_type, grain_lbs, water_gal, start_date, status)
    VALUES (1, 'WASH-2026-001', 'Test Recipe', 'Corn', 100, 100, '2026-01-01', 'planned')
  `);
  db.run(`INSERT INTO inventory_categories (id, name) VALUES (1, 'Grain')`);
  db.run(`
    INSERT INTO inventory_items (id, name, category, unit, quantity)
    VALUES (1, 'Corn', 'Grain', 'lbs', 500)
  `);
  return db;
}

export function exportDatabaseBase64(db: Database): string {
  const bytes = db.export();
  return Buffer.from(bytes).toString('base64');
}
