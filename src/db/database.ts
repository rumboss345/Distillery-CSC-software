import initSqlJs, { Database, SqlValue } from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { buildCscFloorEquipmentRows, CSC_FLOOR_PLAN_SIZE } from '../lib/csc-floor-equipment';
import { SCHEMA, SEED_DATA } from './schema';

const FLOOR_MIGRATION = `
CREATE TABLE IF NOT EXISTS floor_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Production Floor',
  width_ft REAL NOT NULL DEFAULT 80,
  height_ft REAL NOT NULL DEFAULT 60,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS floor_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor_plan_id INTEGER NOT NULL DEFAULT 1 REFERENCES floor_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL DEFAULT 'fermenter',
  pos_x_ft REAL NOT NULL DEFAULT 4,
  pos_y_ft REAL NOT NULL DEFAULT 4,
  width_ft REAL NOT NULL DEFAULT 8,
  depth_ft REAL NOT NULL DEFAULT 8,
  capacity_gal REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'empty',
  linked_mash_batch_id INTEGER REFERENCES mash_batches(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_floor_equipment_plan ON floor_equipment(floor_plan_id);
`;

const FLOOR_SEED = `
INSERT OR IGNORE INTO floor_plans (id, name, width_ft, height_ft, notes) VALUES
  (1, 'Production Floor', 80, 60, 'Main distillery production area');
INSERT OR IGNORE INTO floor_equipment (id, floor_plan_id, name, equipment_type, pos_x_ft, pos_y_ft, width_ft, depth_ft, capacity_gal, status, linked_mash_batch_id, notes) VALUES
  (1, 1, 'Fermenter #1', 'fermenter', 6, 8, 10, 10, 1000, 'in_use', 2, '1000 gal conical fermenter'),
  (2, 1, 'Fermenter #2', 'fermenter', 20, 8, 10, 10, 1000, 'empty', NULL, 'Available for next batch'),
  (3, 1, 'Wash Tank', 'mash_tun', 6, 28, 14, 12, 600, 'empty', NULL, 'Copper wash tank'),
  (4, 1, 'Pot Still #1', 'pot_still', 48, 10, 12, 14, 200, 'offline', NULL, 'Primary pot still'),
  (5, 1, 'Spirit Safe', 'holding_tank', 64, 12, 6, 4, 50, 'empty', NULL, 'Hearts collection'),
  (6, 1, 'Low Wines Receiver', 'holding_tank', 64, 22, 8, 6, 100, 'empty', NULL, '');
`;

const ASSIGNMENTS_MIGRATION = `
CREATE TABLE IF NOT EXISTS mash_fermenter_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mash_batch_id INTEGER NOT NULL REFERENCES mash_batches(id) ON DELETE CASCADE,
  floor_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
  volume_gal REAL NOT NULL DEFAULT 0,
  UNIQUE(mash_batch_id, floor_equipment_id)
);
CREATE INDEX IF NOT EXISTS idx_mash_fermenter_mash ON mash_fermenter_assignments(mash_batch_id);
CREATE INDEX IF NOT EXISTS idx_mash_fermenter_equipment ON mash_fermenter_assignments(floor_equipment_id);
`;

const FERMENTER_SOURCE_MIGRATION = `
ALTER TABLE distillation_runs ADD COLUMN source_fermenter_equipment_id INTEGER REFERENCES floor_equipment(id);
`;

const FERMENTATION_FERMENTER_MIGRATION = `
ALTER TABLE fermentation_logs ADD COLUMN floor_equipment_id INTEGER REFERENCES floor_equipment(id);
CREATE INDEX IF NOT EXISTS idx_fermentation_fermenter ON fermentation_logs(floor_equipment_id);
`;

const CUT_HOLDING_TANK_MIGRATION = `
ALTER TABLE distillation_cuts ADD COLUMN holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id);
CREATE INDEX IF NOT EXISTS idx_cuts_holding_tank ON distillation_cuts(holding_tank_equipment_id);
`;

const LOW_WINES_RUN_MIGRATION = `
ALTER TABLE distillation_runs ADD COLUMN run_type TEXT NOT NULL DEFAULT 'wash';
ALTER TABLE distillation_runs ADD COLUMN source_holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id);
ALTER TABLE distillation_runs ADD COLUMN charge_abv REAL;
`;

const DEST_HOLDING_TANK_MIGRATION = `
ALTER TABLE distillation_runs ADD COLUMN dest_holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id);
`;

const TANK_TRANSFERS_MIGRATION = `
CREATE TABLE IF NOT EXISTS holding_tank_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spirit_type TEXT NOT NULL DEFAULT 'low_wines',
  source_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
  dest_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
  volume_gal REAL NOT NULL DEFAULT 0,
  abv REAL NOT NULL DEFAULT 0,
  transfer_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tank_transfers_source ON holding_tank_transfers(source_tank_equipment_id);
CREATE INDEX IF NOT EXISTS idx_tank_transfers_dest ON holding_tank_transfers(dest_tank_equipment_id);
`;

const YEAST_LBS_MIGRATION = `
ALTER TABLE mash_batches ADD COLUMN yeast_lbs REAL NOT NULL DEFAULT 0;
`;

const INVENTORY_CATEGORIES_MIGRATION = `
CREATE TABLE IF NOT EXISTS inventory_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO inventory_categories (name) VALUES
  ('sugar'),
  ('yeast'),
  ('barrels'),
  ('bottles'),
  ('labels'),
  ('other');
INSERT OR IGNORE INTO inventory_categories (name)
  SELECT DISTINCT category FROM inventory_items
  WHERE category IS NOT NULL AND trim(category) != '';
`;

const BLENDING_MIGRATION = `
CREATE TABLE IF NOT EXISTS blend_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  source_holding_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
  base_spirit_volume_gal REAL NOT NULL DEFAULT 0,
  base_spirit_abv REAL NOT NULL DEFAULT 0,
  blend_date TEXT NOT NULL,
  target_abv REAL,
  final_volume_gal REAL NOT NULL DEFAULT 0,
  final_abv REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS blend_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blend_product_id INTEGER NOT NULL REFERENCES blend_products(id) ON DELETE CASCADE,
  ingredient_type TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'gal',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_blend_products_tank ON blend_products(source_holding_tank_equipment_id);
CREATE INDEX IF NOT EXISTS idx_blend_ingredients_product ON blend_ingredients(blend_product_id);
`;

function seedCscFloorEquipment(options: {
  onlyMissing?: boolean;
  assignSequentialIds?: boolean;
  demoStatusForFirstTwo?: boolean;
} = {}): void {
  if (!db) return;

  db.run(
    `UPDATE floor_plans SET width_ft=?, height_ft=?, notes=? WHERE id=1`,
    [CSC_FLOOR_PLAN_SIZE.width_ft, CSC_FLOOR_PLAN_SIZE.height_ft, 'CSC distillery production floor'],
  );

  const rows = buildCscFloorEquipmentRows(1, {
    demoStatusForFirstTwo: options.demoStatusForFirstTwo,
  });

  rows.forEach((row, index) => {
    if (options.onlyMissing) {
      const exists = queryOne<{ id: number }>(
        'SELECT id FROM floor_equipment WHERE name = ? COLLATE NOCASE',
        [row.name],
      );
      if (exists) return;
    }

    const params: SqlValue[] = [
      row.floor_plan_id,
      row.name,
      row.equipment_type,
      row.pos_x_ft,
      row.pos_y_ft,
      row.width_ft,
      row.depth_ft,
      row.capacity_gal,
      row.status,
      row.linked_mash_batch_id,
      row.notes,
    ];

    if (options.assignSequentialIds) {
      db!.run(
        `INSERT OR IGNORE INTO floor_equipment (id, floor_plan_id, name, equipment_type, pos_x_ft, pos_y_ft, width_ft, depth_ft, capacity_gal, status, linked_mash_batch_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [index + 1, ...params],
      );
    } else {
      db!.run(
        `INSERT INTO floor_equipment (floor_plan_id, name, equipment_type, pos_x_ft, pos_y_ft, width_ft, depth_ft, capacity_gal, status, linked_mash_batch_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params,
      );
    }
  });
}

function runMigrations(): void {
  if (!db) return;
  const hasFloor = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='floor_plans'",
  );
  if (!hasFloor) {
    db.run(FLOOR_MIGRATION);
    db.run(FLOOR_SEED);
    persistDb();
  }

  const hasAssignments = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='mash_fermenter_assignments'",
  );
  if (!hasAssignments) {
    db.run(ASSIGNMENTS_MIGRATION);
    // Migrate legacy linked_mash_batch_id into assignments
    db.run(`
      INSERT OR IGNORE INTO mash_fermenter_assignments (mash_batch_id, floor_equipment_id, volume_gal)
      SELECT fe.linked_mash_batch_id, fe.id, COALESCE(mb.water_gal, 0)
      FROM floor_equipment fe
      JOIN mash_batches mb ON mb.id = fe.linked_mash_batch_id
      WHERE fe.equipment_type = 'fermenter' AND fe.linked_mash_batch_id IS NOT NULL
    `);
    persistDb();
  }

  const hasFermenterSource = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('distillation_runs') WHERE name='source_fermenter_equipment_id'",
  );
  if (!hasFermenterSource) {
    db.run(FERMENTER_SOURCE_MIGRATION);
    persistDb();
  }

  const hasFermentationFermenter = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('fermentation_logs') WHERE name='floor_equipment_id'",
  );
  if (!hasFermentationFermenter) {
    db.run(FERMENTATION_FERMENTER_MIGRATION);
    // Backfill single-fermenter logs so existing readings stay with their fermenter
    db.run(`
      UPDATE fermentation_logs
      SET floor_equipment_id = (
        SELECT a.floor_equipment_id
        FROM mash_fermenter_assignments a
        WHERE a.mash_batch_id = fermentation_logs.mash_batch_id
        LIMIT 1
      )
      WHERE floor_equipment_id IS NULL
        AND (
          SELECT COUNT(*) FROM mash_fermenter_assignments a
          WHERE a.mash_batch_id = fermentation_logs.mash_batch_id
        ) = 1
    `);
    persistDb();
  }

  const hasCutHoldingTank = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('distillation_cuts') WHERE name='holding_tank_equipment_id'",
  );
  if (!hasCutHoldingTank) {
    db.run(CUT_HOLDING_TANK_MIGRATION);
    persistDb();
  }

  const hasLowWinesRun = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('distillation_runs') WHERE name='run_type'",
  );
  if (!hasLowWinesRun) {
    db.run(LOW_WINES_RUN_MIGRATION);
    persistDb();
  }

  const hasDestHoldingTank = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('distillation_runs') WHERE name='dest_holding_tank_equipment_id'",
  );
  if (!hasDestHoldingTank) {
    db.run(DEST_HOLDING_TANK_MIGRATION);
    persistDb();
  }

  const hasBlending = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='blend_products'",
  );
  if (!hasBlending) {
    db.run(BLENDING_MIGRATION);
    persistDb();
  }

  const hasYeastLbs = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('mash_batches') WHERE name='yeast_lbs'",
  );
  if (!hasYeastLbs) {
    db.run(YEAST_LBS_MIGRATION);
    persistDb();
  }

  const hasInventoryCategories = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_categories'",
  );
  if (!hasInventoryCategories) {
    db.run(INVENTORY_CATEGORIES_MIGRATION);
    persistDb();
  }

  const hasTankTransfers = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='holding_tank_transfers'",
  );
  if (!hasTankTransfers) {
    db.run(TANK_TRANSFERS_MIGRATION);
    persistDb();
  }

  const hasGrainKg = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('mash_batches') WHERE name='grain_kg'",
  );
  const hasGrainLbs = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('mash_batches') WHERE name='grain_lbs'",
  );
  if (hasGrainKg && !hasGrainLbs) {
    db.run('ALTER TABLE mash_batches ADD COLUMN grain_lbs REAL NOT NULL DEFAULT 0');
    db.run('UPDATE mash_batches SET grain_lbs = ROUND(grain_kg * 2.20462, 1)');
    persistDb();
  }

  const hasWaterL = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('mash_batches') WHERE name='water_l'",
  );
  const hasWaterGal = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('mash_batches') WHERE name='water_gal'",
  );
  if (hasWaterL && !hasWaterGal) {
    db.run('ALTER TABLE mash_batches ADD COLUMN water_gal REAL NOT NULL DEFAULT 0');
    db.run('UPDATE mash_batches SET water_gal = ROUND(water_l * 0.264172, 1)');
    persistDb();
  }

  const hasTempC = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('fermentation_logs') WHERE name='temperature_c'",
  );
  const hasTempF = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('fermentation_logs') WHERE name='temperature_f'",
  );
  if (hasTempC && !hasTempF) {
    db.run('ALTER TABLE fermentation_logs ADD COLUMN temperature_f REAL');
    db.run('UPDATE fermentation_logs SET temperature_f = ROUND(temperature_c * 9.0 / 5.0 + 32, 1)');
    persistDb();
  }

  db.run(`
    UPDATE inventory_items
    SET quantity = ROUND(quantity * 2.20462, 1),
        reorder_level = ROUND(reorder_level * 2.20462, 1),
        unit = 'lbs'
    WHERE lower(unit) = 'kg'
  `);
  db.run(`UPDATE inventory_items SET category = 'sugar' WHERE category = 'grain'`);
  db.run(`
    UPDATE floor_equipment
    SET name = 'Wash Tank',
        notes = CASE WHEN notes = 'Copper mash tun' THEN 'Copper wash tank' ELSE notes END
    WHERE name = 'Mash Tun' AND equipment_type = 'mash_tun'
  `);
  seedCscFloorEquipment({ onlyMissing: true });
  db.run(`UPDATE floor_equipment SET capacity_gal = 1000 WHERE equipment_type = 'fermenter'`);
  migrateFloorPlanPages();
  persistDb();
}

function migrateFloorPlanPages(): void {
  if (!db) return;
  const planCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM floor_plans')?.count ?? 0;
  if (planCount <= 1) {
    db.run(`UPDATE floor_plans SET name = 'Inside' WHERE id = 1`);
    db.run(`
      INSERT OR IGNORE INTO floor_plans (id, name, width_ft, height_ft, notes) VALUES
        (2, 'Outside', 160, 120, 'Outdoor equipment area')
    `);
  }
}

const DB_STORAGE_KEY = 'distillery-tracker-db-v5';

const LEGACY_DB_KEYS = [
  'distillery-tracker-db-v5',
  'distillery-tracker-db-v4',
  'distillery-tracker-db-v3',
];

let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function rowToObject<T>(
  columns: string[],
  values: SqlValue[],
): T {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = values[i];
  });
  return obj as T;
}

function queryAll<T>(
  sql: string,
  params: SqlValue[] = [],
): T[] {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(rowToObject<T>(stmt.getColumnNames(), stmt.get()));
  }
  stmt.free();
  return results;
}

function queryOne<T>(
  sql: string,
  params: SqlValue[] = [],
): T | null {
  const rows = queryAll<T>(sql, params);
  return rows[0] ?? null;
}

function toBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < data.length; i += chunkSize) {
    binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function persistDb(): void {
  if (!db) return;
  localStorage.setItem(DB_STORAGE_KEY, toBase64(new Uint8Array(db.export())));
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistDb, 300);
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  let stored = localStorage.getItem(DB_STORAGE_KEY);
  if (!stored) {
    stored = localStorage.getItem('distillery-tracker-db-v4');
  }
  if (stored) {
    const binary = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    db = new SQL.Database(binary);
    runMigrations();
  } else {
    db = new SQL.Database();
    db.run(SCHEMA);
    db.run(SEED_DATA);
    seedCscFloorEquipment({ assignSequentialIds: true, demoStatusForFirstTwo: true });
    persistDb();
  }

  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function assertLocalWriteAllowed(): void {
  try {
    const raw = sessionStorage.getItem('csc-production-mode-cache');
    if (!raw) return;
    const status = JSON.parse(raw) as { serverAuthoritative?: boolean; migrationState?: string };
    if (status.serverAuthoritative || status.migrationState === 'SERVER_AUTHORITATIVE') {
      throw new Error('Central production database unavailable. Changes cannot be recorded.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Changes cannot be recorded')) throw err;
  }
}

export function runQuery(sql: string, params: SqlValue[] = []): void {
  assertLocalWriteAllowed();
  getDb().run(sql, params);
  scheduleSave();
}

export function insertRow(
  sql: string,
  params: SqlValue[] = [],
): number {
  assertLocalWriteAllowed();
  getDb().run(sql, params);
  scheduleSave();
  const result = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return result?.id ?? 0;
}

export { queryAll, queryOne, scheduleSave };

export function resetDatabase(): void {
  for (const key of LEGACY_DB_KEYS) {
    localStorage.removeItem(key);
  }
  if (db) {
    db.close();
    db = null;
  }
}

export async function clearAllData(): Promise<void> {
  resetDatabase();
  await initDatabase();
}

export function exportDatabase(): Uint8Array {
  return new Uint8Array(getDb().export());
}

export function importDatabase(data: Uint8Array): void {
  if (db) db.close();
  db = null;
  localStorage.setItem(DB_STORAGE_KEY, toBase64(data));
}
