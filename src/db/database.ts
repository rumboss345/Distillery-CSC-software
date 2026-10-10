import initSqlJs, { Database, SqlValue } from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { buildBlendRecipeSnapshot } from '../lib/blend-recipe-version';
import { buildCscFloorEquipmentRows, CSC_FLOOR_PLAN_SIZE } from '../lib/csc-floor-equipment';
import { PACKAGING_BOTTLES } from '../lib/packaging-bottles';
import type { BlendIngredientInput } from '../types';
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
  process_pos_x REAL,
  process_pos_y REAL,
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
  status TEXT NOT NULL DEFAULT 'fermenting',
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

const SPIRIT_CHARGE_PROOF_MIGRATION = [
  'ALTER TABLE distillation_runs ADD COLUMN proof_spirit_gal REAL',
  'ALTER TABLE distillation_runs ADD COLUMN proof_spirit_abv REAL',
  'ALTER TABLE distillation_runs ADD COLUMN proof_water_gal REAL NOT NULL DEFAULT 0',
  'ALTER TABLE distillation_runs ADD COLUMN proof_place TEXT',
];

const STILLAGE_MIGRATION = [
  'ALTER TABLE distillation_runs ADD COLUMN stillage_volume_gal REAL',
  'ALTER TABLE distillation_runs ADD COLUMN stillage_discarded INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE distillation_runs ADD COLUMN stillage_holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id)',
];

const WAREHOUSE_LOCATIONS_MIGRATION = [
  `CREATE TABLE IF NOT EXISTS warehouse_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `INSERT OR IGNORE INTO warehouse_locations (name)
   SELECT warehouse_location FROM barrels
   WHERE TRIM(warehouse_location) != ''
   GROUP BY warehouse_location COLLATE NOCASE`,
];

const DISCARDED_FERMENTATIONS_MIGRATION = [
  `CREATE TABLE IF NOT EXISTS discarded_fermentations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mash_batch_id INTEGER REFERENCES mash_batches(id),
    source_fermenter_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
    batch_number TEXT NOT NULL DEFAULT '',
    fermenter_name TEXT NOT NULL DEFAULT '',
    volume_gal REAL NOT NULL,
    discarded_date TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_discarded_fermentations_date ON discarded_fermentations(discarded_date)',
];

const TANK_TRANSFERS_MIGRATION = `
CREATE TABLE IF NOT EXISTS holding_tank_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spirit_type TEXT NOT NULL DEFAULT 'low_wines',
  source_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
  dest_tank_equipment_id INTEGER REFERENCES floor_equipment(id),
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

  const hasAssignmentStatus = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('mash_fermenter_assignments') WHERE name='status'",
  );
  if (!hasAssignmentStatus) {
    db.run(`ALTER TABLE mash_fermenter_assignments ADD COLUMN status TEXT NOT NULL DEFAULT 'fermenting'`);
    db.run(`
      UPDATE mash_fermenter_assignments
      SET status = CASE
        WHEN (SELECT status FROM mash_batches m WHERE m.id = mash_fermenter_assignments.mash_batch_id) = 'complete' THEN 'complete'
        WHEN (SELECT status FROM mash_batches m WHERE m.id = mash_fermenter_assignments.mash_batch_id) = 'discarded' THEN 'discarded'
        ELSE 'fermenting'
      END
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

  const hasSpiritChargeProof = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('distillation_runs') WHERE name='proof_water_gal'",
  );
  if (!hasSpiritChargeProof) {
    for (const statement of SPIRIT_CHARGE_PROOF_MIGRATION) db.run(statement);
    persistDb();
  }

  const hasStillage = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('distillation_runs') WHERE name='stillage_volume_gal'",
  );
  if (!hasStillage) {
    for (const statement of STILLAGE_MIGRATION) db.run(statement);
    persistDb();
  }

  const hasDiscardedFermentations = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='discarded_fermentations'",
  );
  if (!hasDiscardedFermentations) {
    for (const statement of DISCARDED_FERMENTATIONS_MIGRATION) db.run(statement);
    persistDb();
  }

  const hasWarehouseLocations = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='warehouse_locations'",
  );
  if (!hasWarehouseLocations) {
    for (const statement of WAREHOUSE_LOCATIONS_MIGRATION) db.run(statement);
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
  db.run(`
    UPDATE floor_equipment
    SET equipment_type = 'holding_tank',
        status = CASE WHEN status = 'offline' THEN 'empty' ELSE status END,
        notes = CASE name
          WHEN 'Latina 500L' THEN '500L holding tank'
          WHEN 'Latina 300-1' THEN '300L holding tank'
          WHEN 'Latina 300-2' THEN '300L holding tank'
          WHEN 'Latina 300-3' THEN '300L holding tank'
          ELSE notes
        END
    WHERE name IN ('Latina 500L', 'Latina 300-1', 'Latina 300-2', 'Latina 300-3')
      AND equipment_type IN ('pot_still', 'column_still')
  `);
  db.run(`
    UPDATE floor_equipment
    SET equipment_type = 'collection_vessel',
        notes = CASE name
          WHEN 'Latina 500L' THEN '500L collection vessel'
          WHEN 'Latina 300-1' THEN '300L collection vessel'
          WHEN 'Latina 300-2' THEN '300L collection vessel'
          WHEN 'Latina 300-3' THEN '300L collection vessel'
          ELSE notes
        END
    WHERE name IN (
      'Latina 500L',
      'Latina 300-1',
      'Latina 300-2',
      'Latina 300-3',
      'Low wines collection tank of Vendome'
    )
  `);
  db.run(`
    UPDATE floor_equipment
    SET name = 'Groen kettle',
        equipment_type = 'mash_tun',
        capacity_gal = 100,
        notes = 'Groen wash kettle'
    WHERE equipment_type = 'mash_tun'
      AND name IN ('Wash tank', 'Groen kettle')
      AND capacity_gal < 200
  `);
  db.run(`
    UPDATE floor_equipment
    SET name = 'Wash tank',
        capacity_gal = 2000,
        notes = 'Primary wash tank'
    WHERE equipment_type = 'mash_tun'
      AND name IN ('Legacy wash tank (demo)', 'Wash Tank')
  `);
  db.run(`UPDATE floor_equipment SET capacity_gal = 1000 WHERE equipment_type = 'fermenter'`);
  db.run(`
    UPDATE floor_equipment
    SET capacity_gal = CASE name
      WHEN 'Blending tank for bulk Spirits' THEN 250
      WHEN 'Canning blending tank' THEN 250
      WHEN 'Dunder tank' THEN 1000
      WHEN 'Low wines storage Tank 5' THEN 2000
      WHEN 'Stillage Storage tank' THEN 5000
      WHEN 'Storage for Heavy rum tank' THEN 250
      WHEN 'Storage tank of tails runs' THEN 250
      WHEN 'Vodka high proof storage' THEN 250
      ELSE capacity_gal
    END
    WHERE name IN (
      'Blending tank for bulk Spirits',
      'Canning blending tank',
      'Dunder tank',
      'Low wines storage Tank 5',
      'Stillage Storage tank',
      'Storage for Heavy rum tank',
      'Storage tank of tails runs',
      'Vodka high proof storage'
    )
  `);
  const hasProcessPos = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('floor_equipment') WHERE name='process_pos_x'",
  );
  if (!hasProcessPos) {
    db.run('ALTER TABLE floor_equipment ADD COLUMN process_pos_x REAL');
    db.run('ALTER TABLE floor_equipment ADD COLUMN process_pos_y REAL');
    persistDb();
  }

  const hasMaintenanceStatus = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('floor_equipment') WHERE name='maintenance_status'",
  );
  if (!hasMaintenanceStatus) {
    db.run('ALTER TABLE floor_equipment ADD COLUMN maintenance_status TEXT');
    db.run("ALTER TABLE floor_equipment ADD COLUMN maintenance_notes TEXT NOT NULL DEFAULT ''");
    persistDb();
  }

  const hasCleanedAt = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('floor_equipment') WHERE name='cleaned_at'",
  );
  if (!hasCleanedAt) {
    db.run('ALTER TABLE floor_equipment ADD COLUMN cleaned_at TEXT');
    db.run('ALTER TABLE floor_equipment ADD COLUMN cleaned_by_user_id INTEGER');
    db.run('ALTER TABLE floor_equipment ADD COLUMN cleaned_by_user_name TEXT');
    persistDb();
  }

  const hasMaintenanceLog = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='equipment_maintenance_log'",
  );
  if (!hasMaintenanceLog) {
    db.run(`
      CREATE TABLE equipment_maintenance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        floor_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        maintenance_status TEXT,
        notes TEXT NOT NULL DEFAULT '',
        recorded_by_user_id INTEGER,
        recorded_by_user_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_log_equipment ON equipment_maintenance_log(floor_equipment_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_log_created ON equipment_maintenance_log(created_at)');
    persistDb();
  }

  const hasRecipes = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='recipes'",
  );
  if (!hasRecipes) {
    db.run(`
      CREATE TABLE recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        spirit_type TEXT NOT NULL DEFAULT '',
        grain_type TEXT NOT NULL DEFAULT '',
        grain_lbs REAL NOT NULL DEFAULT 0,
        water_gal REAL NOT NULL DEFAULT 0,
        yeast_strain TEXT NOT NULL DEFAULT '',
        yeast_lbs REAL NOT NULL DEFAULT 0,
        target_brix REAL,
        target_final_brix REAL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.run(`
      INSERT OR IGNORE INTO recipes (id, name, spirit_type, grain_type, grain_lbs, water_gal, yeast_strain, yeast_lbs, target_brix, target_final_brix, notes) VALUES
        (1, 'Molasses Wash', 'Rum', 'Blackstrap Molasses', 400, 150, 'Distillers Yeast DADY', 2, 16.0, 2.5, 'Standard molasses wash for rum production'),
        (2, 'Cane Sugar Wash', 'Rum', 'Raw Cane Sugar', 750, 225, 'Distillers Yeast DADY', 3, 17.1, 2.0, 'High-test cane sugar wash')
    `);
    persistDb();
  }

  const hasEquipmentTypes = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='equipment_types'",
  );
  if (!hasEquipmentTypes) {
    db.run(`
      CREATE TABLE equipment_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    persistDb();
  }

  migrateInventoryPackageSize();
  migrateFormulationPrecisionColumns();
  seedPackagingBottles();
  migratePackagingBottleColumn();
  migrateBottlingTankSourceColumns();
  migrateBottlingVolumeVarianceColumns();
  migrateBottlingRunLines();
  migrateBlendRecipes();
  migrateBarrelBlendRecipes();
  migrateBarrelFills();
  migrateBarrelSourceHoldingTank();
  migrateFloorPlanPages();
  migrateAdvancedBlending();
  migrateAssignedEmployee();
  migrateFermentationSchedule();
  migrateProductionStatusLogs();
  migrateRecipeNutrients();
  migrateMashBatchNutrients();
  migrateBlendRecipeVersions();
  clearAllBlendRecipesOnce();
  migrateStillageDiscardTransfers();
  migrateHoldingTankVolumeVariances();
  migrateGinRuns();
  db.run(`
    UPDATE floor_equipment
    SET equipment_type = 'stillage_tank'
    WHERE equipment_type = 'holding_tank'
      AND name LIKE '%stillage%' COLLATE NOCASE
  `);
  persistDb();
}

function migrateGinRuns(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS distillation_run_botanicals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      distillation_run_id INTEGER NOT NULL REFERENCES distillation_runs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      weight REAL NOT NULL DEFAULT 0,
      weight_unit TEXT NOT NULL DEFAULT 'g',
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_run_botanicals_run ON distillation_run_botanicals(distillation_run_id)');
  db.run(`
    CREATE TABLE IF NOT EXISTS gin_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS gin_recipe_botanicals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gin_recipe_id INTEGER NOT NULL REFERENCES gin_recipes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      weight REAL NOT NULL DEFAULT 0,
      weight_unit TEXT NOT NULL DEFAULT 'g',
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_gin_recipe_botanicals_recipe ON gin_recipe_botanicals(gin_recipe_id)');
  db.run(`INSERT OR IGNORE INTO inventory_categories (name) VALUES ('botanicals')`);
  const botanicals = [
    'Juniper berries',
    'Coriander seed',
    'Angelica root',
    'Orris root',
    'Citrus peel',
  ];
  for (const name of botanicals) {
    const exists = queryOne<{ id: number }>(
      'SELECT id FROM inventory_items WHERE name = ? COLLATE NOCASE AND category = ?',
      [name, 'botanicals'],
    );
    if (exists) continue;
    db.run(
      `INSERT INTO inventory_items (name, category, unit, quantity, reorder_level, notes) VALUES (?, 'botanicals', 'g', 0, 100, 'Gin botanical')`,
      [name],
    );
  }
  persistDb();
}

/** Stillage leaving a stillage tank can be discarded, so the destination tank is optional. */
function migrateHoldingTankVolumeVariances(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS holding_tank_volume_variances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
      book_volume_gal REAL NOT NULL,
      book_abv REAL NOT NULL,
      set_volume_gal REAL NOT NULL,
      set_abv REAL NOT NULL,
      variance_gal REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_tank_volume_variances_tank ON holding_tank_volume_variances(tank_equipment_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tank_volume_variances_date ON holding_tank_volume_variances(recorded_at)');
}

function migrateStillageDiscardTransfers(): void {
  if (!db) return;
  const dest = queryOne<{ is_required: number }>(
    "SELECT \"notnull\" AS is_required FROM pragma_table_info('holding_tank_transfers') WHERE name = 'dest_tank_equipment_id'",
  );
  if (!dest || dest.is_required === 0) return;
  db.run('ALTER TABLE holding_tank_transfers RENAME TO holding_tank_transfers_old');
  db.run(`
    CREATE TABLE holding_tank_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spirit_type TEXT NOT NULL DEFAULT 'low_wines',
      source_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
      dest_tank_equipment_id INTEGER REFERENCES floor_equipment(id),
      volume_gal REAL NOT NULL DEFAULT 0,
      abv REAL NOT NULL DEFAULT 0,
      transfer_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    INSERT INTO holding_tank_transfers
      (id, spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, notes, created_at)
    SELECT id, spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, notes, created_at
    FROM holding_tank_transfers_old
  `);
  db.run('DROP TABLE holding_tank_transfers_old');
  db.run('CREATE INDEX IF NOT EXISTS idx_tank_transfers_source ON holding_tank_transfers(source_tank_equipment_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tank_transfers_dest ON holding_tank_transfers(dest_tank_equipment_id)');
}

function migrateMashBatchNutrients(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS mash_batch_nutrients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mash_batch_id INTEGER NOT NULL REFERENCES mash_batches(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      lbs REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'lbs'
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_mash_batch_nutrients_batch ON mash_batch_nutrients(mash_batch_id)
  `);
  const hasUnit = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('mash_batch_nutrients') WHERE name='unit'",
  );
  if (!hasUnit) {
    db.run("ALTER TABLE mash_batch_nutrients ADD COLUMN unit TEXT NOT NULL DEFAULT 'lbs'");
  }
}

function migrateRecipeNutrients(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS recipe_nutrients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'lbs',
      inventory_item_id INTEGER REFERENCES inventory_items(id),
      notes TEXT NOT NULL DEFAULT ''
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_recipe_nutrients_recipe ON recipe_nutrients(recipe_id)
  `);
  db.run(`INSERT OR IGNORE INTO inventory_categories (name) VALUES ('nutrients')`);
  db.run(`
    INSERT OR IGNORE INTO inventory_items (id, name, category, unit, quantity, reorder_level, notes) VALUES
      (18, 'Diammonium Phosphate (DAP)', 'nutrients', 'lbs', 50, 10, 'Yeast nutrient for molasses wash'),
      (19, 'Ammonium Sulphate', 'nutrients', 'lbs', 25, 5, 'Yeast nutrient for molasses wash')
  `);
  const molasses = queryOne<{ id: number }>(
    "SELECT id FROM recipes WHERE name = 'Molasses Wash' COLLATE NOCASE LIMIT 1",
  );
  if (molasses) {
    const existing = queryOne<{ n: number }>(
      'SELECT COUNT(*) as n FROM recipe_nutrients WHERE recipe_id = ?',
      [molasses.id],
    );
    if (!existing || existing.n === 0) {
      db.run(
        `INSERT INTO recipe_nutrients (recipe_id, name, amount, unit, inventory_item_id, notes) VALUES (?, ?, ?, ?, ?, ?)`,
        [molasses.id, 'Diammonium Phosphate (DAP)', 5, 'lbs', 18, 'Added at wort prep'],
      );
      db.run(
        `INSERT INTO recipe_nutrients (recipe_id, name, amount, unit, inventory_item_id, notes) VALUES (?, ?, ?, ?, ?, ?)`,
        [molasses.id, 'Ammonium Sulphate', 2, 'lbs', 19, ''],
      );
    }
  }
}

function migrateFermentationSchedule(): void {
  if (!db) return;
  addColumnIfMissing('mash_batches', 'fermentation_start_date', 'TEXT');
  addColumnIfMissing('mash_batches', 'expected_completion_date', 'TEXT');
}

function migrateProductionStatusLogs(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS production_status_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_kind TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      floor_equipment_id INTEGER,
      previous_status TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      changed_by TEXT NOT NULL DEFAULT ''
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_production_status_logs_record
      ON production_status_logs(record_kind, record_id, changed_at)
  `);
}

function migrateAssignedEmployee(): void {
  if (!db) return;
  for (const table of ['mash_batches', 'distillation_runs', 'blend_products']) {
    const hasAssignee = queryOne<{ name: string }>(
      `SELECT name FROM pragma_table_info('${table}') WHERE name='assigned_user_id'`,
    );
    if (!hasAssignee) {
      db.run(`ALTER TABLE ${table} ADD COLUMN assigned_user_id INTEGER`);
      db.run(`ALTER TABLE ${table} ADD COLUMN assigned_user_name TEXT NOT NULL DEFAULT ''`);
    }
  }
}

/** One-time wipe of the starter blend recipes so the list starts empty. */
function clearAllBlendRecipesOnce(): void {
  if (!db) return;
  const hasRecipes = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='blend_recipes'",
  );
  if (!hasRecipes) return;

  db.run('CREATE TABLE IF NOT EXISTS app_flags (name TEXT PRIMARY KEY)');
  const done = queryOne<{ name: string }>(
    'SELECT name FROM app_flags WHERE name = ?',
    ['cleared_blend_recipes_v1'],
  );
  if (done) return;

  const hasProducts = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='blend_products'",
  );
  if (hasProducts) {
    const hasRecipe = queryOne<{ name: string }>(
      "SELECT name FROM pragma_table_info('blend_products') WHERE name = 'blend_recipe_id'",
    );
    if (hasRecipe) db.run('UPDATE blend_products SET blend_recipe_id = NULL');
    const hasVersion = queryOne<{ name: string }>(
      "SELECT name FROM pragma_table_info('blend_products') WHERE name = 'blend_recipe_version_id'",
    );
    if (hasVersion) db.run('UPDATE blend_products SET blend_recipe_version_id = NULL');
  }

  for (const table of ['blend_recipe_spirit_sources', 'blend_recipe_ingredients', 'blend_recipe_versions']) {
    const exists = queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
      [table],
    );
    if (exists) db.run(`DELETE FROM ${table}`);
  }
  db.run('DELETE FROM blend_recipes');
  db.run('INSERT INTO app_flags (name) VALUES (?)', ['cleared_blend_recipes_v1']);
}

function migrateBlendRecipeVersions(): void {
  if (!db) return;
  const hasRecipes = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='blend_recipes'",
  );
  if (!hasRecipes) return;

  for (const [name, def] of [
    ['target_sugar_g_per_l', 'REAL'],
    ['target_volume_gal', 'REAL'],
  ] as const) {
    const has = queryOne<{ name: string }>(
      "SELECT name FROM pragma_table_info('blend_recipes') WHERE name=?",
      [name],
    );
    if (!has) db.run(`ALTER TABLE blend_recipes ADD COLUMN ${name} ${def}`);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS blend_recipe_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blend_recipe_id INTEGER NOT NULL REFERENCES blend_recipes(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (blend_recipe_id, version_number)
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_blend_recipe_versions_recipe ON blend_recipe_versions(blend_recipe_id)
  `);

  const hasProducts = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='blend_products'",
  );
  if (hasProducts) {
    const hasVersion = queryOne<{ name: string }>(
      "SELECT name FROM pragma_table_info('blend_products') WHERE name='blend_recipe_version_id'",
    );
    if (!hasVersion) {
      db.run('ALTER TABLE blend_products ADD COLUMN blend_recipe_version_id INTEGER REFERENCES blend_recipe_versions(id)');
    }
  }

  const hasBarrel = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('blend_recipe_spirit_sources') WHERE name='barrel_id'",
  );
  const spiritSql = hasBarrel
    ? 'SELECT spirit_label, volume_gal, abv, barrel_id FROM blend_recipe_spirit_sources WHERE blend_recipe_id = ? ORDER BY sort_order, id'
    : 'SELECT spirit_label, volume_gal, abv, NULL as barrel_id FROM blend_recipe_spirit_sources WHERE blend_recipe_id = ? ORDER BY sort_order, id';

  const recipes = queryAll<{
    id: number;
    product_name: string;
    target_abv: number | null;
    target_brix: number | null;
    target_sugar_g_per_l: number | null;
    target_volume_gal: number | null;
    scale_factor: number;
    source_type: string | null;
    notes: string;
  }>('SELECT * FROM blend_recipes');

  for (const recipe of recipes) {
    const existing = queryOne<{ id: number }>(
      'SELECT id FROM blend_recipe_versions WHERE blend_recipe_id = ? LIMIT 1',
      [recipe.id],
    );
    if (existing) continue;
    const spiritSources = queryAll<{
      spirit_label: string;
      volume_gal: number;
      abv: number;
      barrel_id: number | null;
    }>(spiritSql, [recipe.id]);
    const ingredients = queryAll<BlendIngredientInput>(
      `SELECT ingredient_type, name, amount, unit, abv, cost_per_unit, lot_number, inventory_item_id, notes
       FROM blend_recipe_ingredients WHERE blend_recipe_id = ? ORDER BY id`,
      [recipe.id],
    );
    const snapshot = buildBlendRecipeSnapshot({
      product_name: recipe.product_name ?? '',
      target_abv: recipe.target_abv,
      target_brix: recipe.target_brix,
      target_sugar_g_per_l: recipe.target_sugar_g_per_l,
      target_volume_gal: recipe.target_volume_gal,
      scale_factor: recipe.scale_factor ?? 1,
      source_type: recipe.source_type ?? 'tank',
      notes: recipe.notes ?? '',
      spirit_sources: spiritSources,
      ingredients,
    });
    db.run(
      `INSERT INTO blend_recipe_versions (blend_recipe_id, version_number, snapshot_json, notes)
       VALUES (?, 1, ?, ?)`,
      [recipe.id, JSON.stringify(snapshot), 'Version 1'],
    );
  }
}

function seedPackagingBottles(): void {
  if (!db) return;
  db.run(`INSERT OR IGNORE INTO inventory_categories (name) VALUES ('packaging')`);
  for (const bottle of PACKAGING_BOTTLES) {
    const exists = queryOne<{ id: number }>(
      'SELECT id FROM inventory_items WHERE name = ? COLLATE NOCASE AND category = ?',
      [bottle.name, 'packaging'],
    );
    if (exists) continue;
    db.run(
      `INSERT INTO inventory_items (name, category, unit, quantity, reorder_level, notes) VALUES (?, 'packaging', 'each', 0, 100, ?)`,
      [bottle.name, `${bottle.sizeMl} ml bottle`],
    );
  }
}

function addColumnIfMissing(table: string, column: string, definition: string): boolean {
  if (!db) return false;
  const hasColumn = queryOne<{ name: string }>(
    `SELECT name FROM pragma_table_info('${table}') WHERE name = ?`,
    [column],
  );
  if (hasColumn) return false;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

/**
 * Nullable formulation columns. Existing recipe rows are left as stored.
 * entered_amount stays null when the original typed quantity was not recorded.
 */
function migrateFormulationPrecisionColumns(): void {
  if (!db) return;
  const added = [
    addColumnIfMissing('blend_recipe_spirit_sources', 'entered_amount', 'REAL'),
    addColumnIfMissing('blend_recipe_spirit_sources', 'entered_unit', 'TEXT'),
    addColumnIfMissing('inventory_items', 'density_g_per_ml', 'REAL'),
    addColumnIfMissing('inventory_items', 'density_reference', 'TEXT'),
    addColumnIfMissing('inventory_items', 'abv', 'REAL'),
    addColumnIfMissing('blend_recipe_ingredients', 'density_g_per_ml', 'REAL'),
    addColumnIfMissing('blend_recipe_ingredients', 'density_assumption', 'TEXT'),
  ];
  if (added.some(Boolean)) persistDb();
}

function migrateInventoryPackageSize(): void {
  if (!db) return;
  const hasColumn = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('inventory_items') WHERE name='package_size_ml'",
  );
  if (!hasColumn) {
    db.run('ALTER TABLE inventory_items ADD COLUMN package_size_ml REAL');
    persistDb();
  }
}

function migratePackagingBottleColumn(): void {
  if (!db) return;
  const hasColumn = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('bottling_runs') WHERE name='packaging_bottle'",
  );
  if (!hasColumn) {
    db.run(`ALTER TABLE bottling_runs ADD COLUMN packaging_bottle TEXT NOT NULL DEFAULT ''`);
    persistDb();
  }
}

function migrateBottlingTankSourceColumns(): void {
  if (!db) return;
  const hasTank = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('bottling_runs') WHERE name='source_holding_tank_equipment_id'",
  );
  if (!hasTank) {
    db.run(`ALTER TABLE bottling_runs ADD COLUMN source_holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id)`);
    persistDb();
  }
  const hasVolume = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('bottling_runs') WHERE name='source_volume_gal'",
  );
  if (!hasVolume) {
    db.run(`ALTER TABLE bottling_runs ADD COLUMN source_volume_gal REAL`);
    persistDb();
  }
}

function migrateBottlingVolumeVarianceColumns(): void {
  if (!db) return;
  const hasBottled = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('bottling_runs') WHERE name='bottled_volume_gal'",
  );
  if (!hasBottled) {
    db.run('ALTER TABLE bottling_runs ADD COLUMN bottled_volume_gal REAL');
    db.run('ALTER TABLE bottling_runs ADD COLUMN volume_variance_gal REAL');
    db.run(`
      UPDATE bottling_runs
      SET bottled_volume_gal = source_volume_gal,
          volume_variance_gal = 0
      WHERE source_holding_tank_equipment_id IS NOT NULL
        AND source_volume_gal IS NOT NULL
    `);
    persistDb();
  }
}

function migrateBottlingRunLines(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS bottling_run_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bottling_run_id INTEGER NOT NULL REFERENCES bottling_runs(id) ON DELETE CASCADE,
      packaging_bottle TEXT NOT NULL DEFAULT '',
      bottle_size_ml INTEGER NOT NULL DEFAULT 750,
      bottle_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_bottling_run_lines_run ON bottling_run_lines(bottling_run_id)
  `);
  db.run(`
    INSERT INTO bottling_run_lines (bottling_run_id, packaging_bottle, bottle_size_ml, bottle_count, sort_order)
    SELECT id, packaging_bottle, bottle_size_ml, bottle_count, 0
    FROM bottling_runs
    WHERE bottle_count > 0
      AND id NOT IN (SELECT bottling_run_id FROM bottling_run_lines)
  `);
}

function migrateBlendRecipes(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS blend_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      product_name TEXT NOT NULL DEFAULT '',
      target_abv REAL,
      target_brix REAL,
      scale_factor REAL NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS blend_recipe_spirit_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blend_recipe_id INTEGER NOT NULL REFERENCES blend_recipes(id) ON DELETE CASCADE,
      spirit_label TEXT NOT NULL DEFAULT '',
      volume_gal REAL NOT NULL DEFAULT 0,
      abv REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS blend_recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blend_recipe_id INTEGER NOT NULL REFERENCES blend_recipes(id) ON DELETE CASCADE,
      ingredient_type TEXT NOT NULL DEFAULT 'other',
      name TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'gal',
      cost_per_unit REAL,
      lot_number TEXT NOT NULL DEFAULT '',
      inventory_item_id INTEGER REFERENCES inventory_items(id),
      notes TEXT NOT NULL DEFAULT ''
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_blend_recipe_spirit_sources_recipe ON blend_recipe_spirit_sources(blend_recipe_id)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_blend_recipe_ingredients_recipe ON blend_recipe_ingredients(blend_recipe_id)
  `);
}

function migrateBarrelBlendRecipes(): void {
  if (!db) return;
  const hasSourceType = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('blend_recipes') WHERE name='source_type'",
  );
  if (!hasSourceType) {
    db.run(`ALTER TABLE blend_recipes ADD COLUMN source_type TEXT NOT NULL DEFAULT 'tank'`);
  }
  const hasRecipeBarrel = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('blend_recipe_spirit_sources') WHERE name='barrel_id'",
  );
  if (!hasRecipeBarrel) {
    db.run(`ALTER TABLE blend_recipe_spirit_sources ADD COLUMN barrel_id INTEGER REFERENCES barrels(id)`);
  }
  const hasBlendBarrel = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('blend_spirit_sources') WHERE name='barrel_id'",
  );
  if (!hasBlendBarrel) {
    db.run(`ALTER TABLE blend_spirit_sources ADD COLUMN barrel_id INTEGER REFERENCES barrels(id)`);
  }
}

function migrateBarrelFills(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS barrel_fills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barrel_id INTEGER NOT NULL REFERENCES barrels(id) ON DELETE CASCADE,
      source_holding_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
      volume_gal REAL NOT NULL,
      abv REAL NOT NULL,
      fill_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_barrel_fills_barrel ON barrel_fills(barrel_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_barrel_fills_tank ON barrel_fills(source_holding_tank_equipment_id)`);
}

function migrateBarrelSourceHoldingTank(): void {
  if (!db) return;
  const hasColumn = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('barrels') WHERE name='source_holding_tank_equipment_id'",
  );
  if (!hasColumn) {
    db.run(
      `ALTER TABLE barrels ADD COLUMN source_holding_tank_equipment_id INTEGER REFERENCES floor_equipment(id)`,
    );
    persistDb();
  }
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

function migrateAdvancedBlending(): void {
  if (!db) return;

  const blendColumns: [string, string][] = [
    ['target_brix', 'REAL'],
    ['scale_factor', 'REAL NOT NULL DEFAULT 1'],
    ['formula_version', 'INTEGER NOT NULL DEFAULT 1'],
    ['formulation_phase', "TEXT NOT NULL DEFAULT 'theoretical'"],
    ['theoretical_volume_gal', 'REAL'],
    ['theoretical_abv', 'REAL'],
    ['theoretical_density', 'REAL'],
    ['theoretical_brix', 'REAL'],
    ['actual_volume_gal', 'REAL'],
    ['actual_abv', 'REAL'],
    ['actual_density', 'REAL'],
    ['actual_brix', 'REAL'],
    ['executed_at', 'TEXT'],
    ['output_holding_tank_equipment_id', 'INTEGER REFERENCES floor_equipment(id)'],
    ['actual_weight_lbs', 'REAL'],
    ['blend_recipe_id', 'INTEGER REFERENCES blend_recipes(id)'],
  ];
  for (const [name, def] of blendColumns) {
    const has = queryOne<{ name: string }>(
      `SELECT name FROM pragma_table_info('blend_products') WHERE name=?`,
      [name],
    );
    if (!has) {
      db.run(`ALTER TABLE blend_products ADD COLUMN ${name} ${def}`);
    }
  }

  const ingredientColumns: [string, string][] = [
    ['cost_per_unit', 'REAL'],
    ['lot_number', "TEXT NOT NULL DEFAULT ''"],
    ['inventory_item_id', 'INTEGER REFERENCES inventory_items(id)'],
    ['abv', 'REAL'],
  ];
  for (const [name, def] of ingredientColumns) {
    const has = queryOne<{ name: string }>(
      `SELECT name FROM pragma_table_info('blend_ingredients') WHERE name=?`,
      [name],
    );
    if (!has) {
      db.run(`ALTER TABLE blend_ingredients ADD COLUMN ${name} ${def}`);
    }
  }
  for (const table of ['blend_recipe_ingredients'] as const) {
    const hasAbv = queryOne<{ name: string }>(
      `SELECT name FROM pragma_table_info('${table}') WHERE name='abv'`,
    );
    if (!hasAbv) {
      db.run(`ALTER TABLE ${table} ADD COLUMN abv REAL`);
    }
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS blend_spirit_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blend_product_id INTEGER NOT NULL REFERENCES blend_products(id) ON DELETE CASCADE,
      holding_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
      volume_gal REAL NOT NULL DEFAULT 0,
      abv REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_blend_spirit_sources_product ON blend_spirit_sources(blend_product_id)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_blend_spirit_sources_tank ON blend_spirit_sources(holding_tank_equipment_id)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS blend_formula_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blend_product_id INTEGER NOT NULL REFERENCES blend_products(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_blend_formula_versions_product ON blend_formula_versions(blend_product_id)
  `);

  db.run(`
    INSERT INTO blend_spirit_sources (blend_product_id, holding_tank_equipment_id, volume_gal, abv, sort_order)
    SELECT id, source_holding_tank_equipment_id, base_spirit_volume_gal, base_spirit_abv, 0
    FROM blend_products
    WHERE base_spirit_volume_gal > 0
      AND id NOT IN (SELECT blend_product_id FROM blend_spirit_sources)
  `);

  db.run(`
    UPDATE blend_products SET status = 'executed' WHERE status = 'blended'
  `);

  const hasOpeningBalances = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='holding_tank_opening_balances'",
  );
  if (!hasOpeningBalances) {
    db.run(`
      CREATE TABLE IF NOT EXISTS holding_tank_opening_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tank_equipment_id INTEGER NOT NULL UNIQUE REFERENCES floor_equipment(id),
        volume_gal REAL NOT NULL,
        alcohol_gal REAL NOT NULL,
        measured_volume_gal REAL NOT NULL,
        measured_abv REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_tank_opening_tank ON holding_tank_opening_balances(tank_equipment_id)');
    persistDb();
  }

  const hasEquipmentIcon = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('floor_equipment') WHERE name='icon'",
  );
  if (!hasEquipmentIcon) {
    db.run("ALTER TABLE floor_equipment ADD COLUMN icon TEXT NOT NULL DEFAULT ''");
    persistDb();
  }

  const hasEquipmentTypeIcon = queryOne<{ name: string }>(
    "SELECT name FROM pragma_table_info('equipment_types') WHERE name='icon'",
  );
  if (!hasEquipmentTypeIcon) {
    db.run("ALTER TABLE equipment_types ADD COLUMN icon TEXT NOT NULL DEFAULT 'other'");
    persistDb();
  }

  migrateVolumeChangeAuditColumns();
  migrateDistillationAlcoholLossColumns();
  migrateBottlingReturnTankColumns();
  migrateBottlingRunReturns();
}

/** Product left after bottling can be sent to another tank. Existing runs stay blank. */
function migrateBottlingReturnTankColumns(): void {
  if (!db) return;
  addColumnIfMissing('bottling_runs', 'return_holding_tank_equipment_id', 'INTEGER');
  addColumnIfMissing('bottling_runs', 'return_volume_gal', 'REAL');
}

/** One bottling run can send leftover spirit to more than one tank. */
function migrateBottlingRunReturns(): void {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS bottling_run_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bottling_run_id INTEGER NOT NULL REFERENCES bottling_runs(id) ON DELETE CASCADE,
      holding_tank_equipment_id INTEGER NOT NULL REFERENCES floor_equipment(id),
      volume_gal REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_bottling_run_returns_run ON bottling_run_returns(bottling_run_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_bottling_run_returns_tank ON bottling_run_returns(holding_tank_equipment_id)');
  db.run(`
    INSERT INTO bottling_run_returns (bottling_run_id, holding_tank_equipment_id, volume_gal, sort_order)
    SELECT id, return_holding_tank_equipment_id, return_volume_gal, 0
    FROM bottling_runs
    WHERE return_holding_tank_equipment_id IS NOT NULL
      AND COALESCE(return_volume_gal, 0) > 0
      AND id NOT IN (SELECT bottling_run_id FROM bottling_run_returns)
  `);
}

/** Who made a volume or ABV correction, and why. Existing rows stay blank. */
function migrateVolumeChangeAuditColumns(): void {
  if (!db) return;
  addColumnIfMissing('discarded_fermentations', 'changed_by', 'TEXT');
  addColumnIfMissing('holding_tank_volume_variances', 'changed_by', 'TEXT');
  addColumnIfMissing('bottling_runs', 'variance_reason', 'TEXT');
  addColumnIfMissing('bottling_runs', 'variance_changed_by', 'TEXT');
}

/** Alcohol charged, alcohol collected, and the loss. Existing runs stay blank until the next save. */
function migrateDistillationAlcoholLossColumns(): void {
  if (!db) return;
  addColumnIfMissing('distillation_runs', 'alcohol_charged_gal', 'REAL');
  addColumnIfMissing('distillation_runs', 'alcohol_collected_gal', 'REAL');
  addColumnIfMissing('distillation_runs', 'alcohol_loss_gal', 'REAL');
  addColumnIfMissing('distillation_runs', 'alcohol_charge_basis', 'TEXT');
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
    clearAllBlendRecipesOnce();
    persistDb();
  }

  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function runQuery(sql: string, params: SqlValue[] = []): void {
  getDb().run(sql, params);
  scheduleSave();
}

export function insertRow(
  sql: string,
  params: SqlValue[] = [],
): number {
  runQuery(sql, params);
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
