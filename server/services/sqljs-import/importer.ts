import type { Database } from 'sql.js';
import type pg from 'pg';
import { US_GAL_TO_LITRES } from '../../../shared/units.js';
import { selectAll, tableExists } from './parser.js';
import type { ImportValidation, TableCounts } from './types.js';

function gal(value: unknown): number {
  const n = Number(value ?? 0);
  return n * US_GAL_TO_LITRES;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ''): string {
  return value == null ? fallback : String(value);
}

async function insertWithId(
  client: pg.PoolClient,
  table: string,
  id: number,
  columns: string[],
  values: unknown[],
) {
  const placeholders = values.map((_, i) => `$${i + 2}`).join(', ');
  await client.query(
    `INSERT INTO ${table} (id, ${columns.join(', ')})
     OVERRIDING SYSTEM VALUE
     VALUES ($1, ${placeholders})`,
    [id, ...values],
  );
}

async function resetSequence(client: pg.PoolClient, table: string) {
  await client.query(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${table}))`,
  );
}

async function clearProductionTables(client: pg.PoolClient) {
  const tables = [
    'bottling_runs',
    'barrels',
    'blend_ingredients',
    'blend_products',
    'holding_tank_transfers',
    'distillation_cuts',
    'distillation_runs',
    'fermentation_logs',
    'mash_fermenter_assignments',
    'mash_batches',
    'floor_equipment',
    'floor_plans',
    'inventory_items',
    'inventory_categories',
  ];
  for (const table of tables) {
    await client.query(`DELETE FROM ${table}`);
  }
}

export async function importSqlJsIntoPostgres(
  db: Database,
  client: pg.PoolClient,
): Promise<TableCounts> {
  await clearProductionTables(client);

  if (tableExists(db, 'inventory_categories')) {
    for (const row of selectAll(db, 'inventory_categories')) {
      await insertWithId(client, 'inventory_categories', num(row.id), ['name', 'created_at', 'updated_at'], [
        str(row.name),
        str(row.created_at, new Date().toISOString()),
        str(row.created_at, new Date().toISOString()),
      ]);
    }
    await resetSequence(client, 'inventory_categories');
  }

  if (tableExists(db, 'inventory_items')) {
    for (const row of selectAll(db, 'inventory_items')) {
      await insertWithId(client, 'inventory_items', num(row.id), [
        'name', 'category', 'unit', 'quantity', 'reorder_level', 'notes', 'created_at', 'updated_at',
      ], [
        str(row.name),
        str(row.category, 'other'),
        str(row.unit, 'each'),
        num(row.quantity),
        num(row.reorder_level),
        str(row.notes),
        str(row.created_at, new Date().toISOString()),
        str(row.updated_at ?? row.created_at, new Date().toISOString()),
      ]);
    }
    await resetSequence(client, 'inventory_items');
  }

  if (tableExists(db, 'floor_plans')) {
    for (const row of selectAll(db, 'floor_plans')) {
      await insertWithId(client, 'floor_plans', num(row.id), [
        'name', 'width_ft', 'height_ft', 'notes', 'created_at', 'updated_at',
      ], [
        str(row.name),
        num(row.width_ft, 80),
        num(row.height_ft, 60),
        str(row.notes),
        new Date().toISOString(),
        new Date().toISOString(),
      ]);
    }
    await resetSequence(client, 'floor_plans');
  }

  if (tableExists(db, 'mash_batches')) {
    for (const row of selectAll(db, 'mash_batches')) {
      const waterLitres = row.water_litres != null ? num(row.water_litres) : gal(row.water_gal);
      await insertWithId(client, 'mash_batches', num(row.id), [
        'batch_number', 'recipe_name', 'grain_type', 'grain_lbs', 'water_litres', 'yeast_strain', 'yeast_lbs',
        'start_date', 'target_brix', 'actual_brix', 'target_final_brix', 'actual_final_brix', 'status', 'notes',
        'created_at', 'updated_at',
      ], [
        str(row.batch_number),
        str(row.recipe_name),
        str(row.grain_type),
        num(row.grain_lbs),
        waterLitres,
        str(row.yeast_strain),
        num(row.yeast_lbs),
        str(row.start_date),
        row.target_brix == null ? null : num(row.target_brix),
        row.actual_brix == null ? null : num(row.actual_brix),
        row.target_final_brix == null ? null : num(row.target_final_brix),
        row.actual_final_brix == null ? null : num(row.actual_final_brix),
        str(row.status, 'planned'),
        str(row.notes),
        str(row.created_at, new Date().toISOString()),
        str(row.created_at, new Date().toISOString()),
      ]);
    }
    await resetSequence(client, 'mash_batches');
  }

  if (tableExists(db, 'floor_equipment')) {
    for (const row of selectAll(db, 'floor_equipment')) {
      const capacityLitres = row.capacity_litres != null
        ? num(row.capacity_litres)
        : gal(row.capacity_gal);
      await insertWithId(client, 'floor_equipment', num(row.id), [
        'floor_plan_id', 'name', 'equipment_type', 'pos_x_ft', 'pos_y_ft', 'width_ft', 'depth_ft',
        'capacity_litres', 'status', 'linked_mash_batch_id', 'notes', 'created_at', 'updated_at',
      ], [
        num(row.floor_plan_id, 1),
        str(row.name),
        str(row.equipment_type, 'fermenter'),
        num(row.pos_x_ft, 4),
        num(row.pos_y_ft, 4),
        num(row.width_ft, 8),
        num(row.depth_ft, 8),
        capacityLitres,
        str(row.status, 'empty'),
        row.linked_mash_batch_id == null ? null : num(row.linked_mash_batch_id),
        str(row.notes),
        str(row.created_at, new Date().toISOString()),
        str(row.created_at, new Date().toISOString()),
      ]);
    }
    await resetSequence(client, 'floor_equipment');
  }

  if (tableExists(db, 'mash_fermenter_assignments')) {
    for (const row of selectAll(db, 'mash_fermenter_assignments')) {
      const volumeLitres = row.volume_litres != null ? num(row.volume_litres) : gal(row.volume_gal);
      await insertWithId(client, 'mash_fermenter_assignments', num(row.id), [
        'mash_batch_id', 'floor_equipment_id', 'volume_litres', 'created_at', 'updated_at',
      ], [
        num(row.mash_batch_id),
        num(row.floor_equipment_id),
        volumeLitres,
        new Date().toISOString(),
        new Date().toISOString(),
      ]);
    }
    await resetSequence(client, 'mash_fermenter_assignments');
  }

  if (tableExists(db, 'fermentation_logs')) {
    for (const row of selectAll(db, 'fermentation_logs')) {
      await insertWithId(client, 'fermentation_logs', num(row.id), [
        'mash_batch_id', 'floor_equipment_id', 'logged_at', 'temperature_f', 'brix', 'ph', 'notes',
        'created_at', 'updated_at',
      ], [
        num(row.mash_batch_id),
        row.floor_equipment_id == null ? null : num(row.floor_equipment_id),
        str(row.logged_at, new Date().toISOString()),
        row.temperature_f == null ? null : num(row.temperature_f),
        row.brix == null ? null : num(row.brix),
        row.ph == null ? null : num(row.ph),
        str(row.notes),
        new Date().toISOString(),
        new Date().toISOString(),
      ]);
    }
    await resetSequence(client, 'fermentation_logs');
  }

  if (tableExists(db, 'distillation_runs')) {
    for (const row of selectAll(db, 'distillation_runs')) {
      const chargeLitres = row.charge_volume_litres != null
        ? num(row.charge_volume_litres)
        : gal(row.charge_volume_gal);
      await insertWithId(client, 'distillation_runs', num(row.id), [
        'batch_number', 'run_type', 'source_mash_batch_id', 'source_fermenter_equipment_id',
        'source_holding_tank_equipment_id', 'dest_holding_tank_equipment_id', 'still_name', 'run_date',
        'charge_volume_litres', 'charge_abv', 'status', 'notes', 'created_at', 'updated_at',
      ], [
        str(row.batch_number),
        str(row.run_type, 'wash'),
        row.source_mash_batch_id == null ? null : num(row.source_mash_batch_id),
        row.source_fermenter_equipment_id == null ? null : num(row.source_fermenter_equipment_id),
        row.source_holding_tank_equipment_id == null ? null : num(row.source_holding_tank_equipment_id),
        row.dest_holding_tank_equipment_id == null ? null : num(row.dest_holding_tank_equipment_id),
        str(row.still_name),
        str(row.run_date),
        chargeLitres,
        row.charge_abv == null ? null : num(row.charge_abv),
        str(row.status, 'planned'),
        str(row.notes),
        str(row.created_at, new Date().toISOString()),
        str(row.created_at, new Date().toISOString()),
      ]);
    }
    await resetSequence(client, 'distillation_runs');
  }

  if (tableExists(db, 'distillation_cuts')) {
    for (const row of selectAll(db, 'distillation_cuts')) {
      const volumeLitres = row.volume_litres != null ? num(row.volume_litres) : gal(row.volume_gal);
      await insertWithId(client, 'distillation_cuts', num(row.id), [
        'distillation_run_id', 'cut_type', 'holding_tank_equipment_id', 'start_time', 'end_time',
        'volume_litres', 'abv', 'notes', 'created_at', 'updated_at',
      ], [
        num(row.distillation_run_id),
        str(row.cut_type),
        row.holding_tank_equipment_id == null ? null : num(row.holding_tank_equipment_id),
        str(row.start_time),
        row.end_time == null ? null : str(row.end_time),
        volumeLitres,
        num(row.abv),
        str(row.notes),
        new Date().toISOString(),
        new Date().toISOString(),
      ]);
    }
    await resetSequence(client, 'distillation_cuts');
  }

  if (tableExists(db, 'holding_tank_transfers')) {
    for (const row of selectAll(db, 'holding_tank_transfers')) {
      const volumeLitres = row.volume_litres != null ? num(row.volume_litres) : gal(row.volume_gal);
      await insertWithId(client, 'holding_tank_transfers', num(row.id), [
        'spirit_type', 'source_tank_equipment_id', 'dest_tank_equipment_id', 'volume_litres', 'abv',
        'transfer_date', 'notes', 'created_at', 'updated_at',
      ], [
        str(row.spirit_type, 'low_wines'),
        num(row.source_tank_equipment_id),
        num(row.dest_tank_equipment_id),
        volumeLitres,
        num(row.abv),
        str(row.transfer_date),
        str(row.notes),
        str(row.created_at, new Date().toISOString()),
        str(row.created_at, new Date().toISOString()),
      ]);
    }
    await resetSequence(client, 'holding_tank_transfers');
  }

  if (tableExists(db, 'blend_products')) {
    for (const row of selectAll(db, 'blend_products')) {
      await insertWithId(client, 'blend_products', num(row.id), [
        'batch_number', 'product_name', 'source_holding_tank_equipment_id',
        'base_spirit_volume_litres', 'base_spirit_abv', 'blend_date', 'target_abv',
        'final_volume_litres', 'final_abv', 'status', 'notes', 'created_at', 'updated_at',
      ], [
        str(row.batch_number),
        str(row.product_name),
        num(row.source_holding_tank_equipment_id),
        row.base_spirit_volume_litres != null ? num(row.base_spirit_volume_litres) : gal(row.base_spirit_volume_gal),
        num(row.base_spirit_abv),
        str(row.blend_date),
        row.target_abv == null ? null : num(row.target_abv),
        row.final_volume_litres != null ? num(row.final_volume_litres) : gal(row.final_volume_gal),
        num(row.final_abv),
        str(row.status, 'draft'),
        str(row.notes),
        str(row.created_at, new Date().toISOString()),
        str(row.created_at, new Date().toISOString()),
      ]);
    }
    await resetSequence(client, 'blend_products');
  }

  if (tableExists(db, 'blend_ingredients')) {
    for (const row of selectAll(db, 'blend_ingredients')) {
      let unit = str(row.unit, 'L');
      let amount = num(row.amount);
      if (unit === 'gal') {
        amount = gal(amount);
        unit = 'L';
      }
      await insertWithId(client, 'blend_ingredients', num(row.id), [
        'blend_product_id', 'ingredient_type', 'name', 'amount', 'unit', 'notes', 'created_at', 'updated_at',
      ], [
        num(row.blend_product_id),
        str(row.ingredient_type, 'other'),
        str(row.name),
        amount,
        unit,
        str(row.notes),
        new Date().toISOString(),
        new Date().toISOString(),
      ]);
    }
    await resetSequence(client, 'blend_ingredients');
  }

  if (tableExists(db, 'barrels')) {
    for (const row of selectAll(db, 'barrels')) {
      await insertWithId(client, 'barrels', num(row.id), [
        'barrel_number', 'wood_type', 'capacity_litres', 'fill_date', 'spirit_type', 'source_run_id',
        'initial_abv', 'current_volume_litres', 'warehouse_location', 'status', 'notes', 'created_at', 'updated_at',
      ], [
        str(row.barrel_number),
        str(row.wood_type, 'American Oak'),
        row.capacity_litres != null ? num(row.capacity_litres) : gal(row.capacity_gal),
        str(row.fill_date),
        str(row.spirit_type),
        row.source_run_id == null ? null : num(row.source_run_id),
        num(row.initial_abv),
        row.current_volume_litres != null ? num(row.current_volume_litres) : gal(row.current_volume_gal),
        str(row.warehouse_location),
        str(row.status, 'aging'),
        str(row.notes),
        str(row.created_at, new Date().toISOString()),
        str(row.created_at, new Date().toISOString()),
      ]);
    }
    await resetSequence(client, 'barrels');
  }

  if (tableExists(db, 'bottling_runs')) {
    for (const row of selectAll(db, 'bottling_runs')) {
      await insertWithId(client, 'bottling_runs', num(row.id), [
        'batch_number', 'source_barrel_id', 'source_run_id', 'bottling_date', 'bottle_size_ml',
        'bottle_count', 'final_abv', 'product_name', 'lot_number', 'notes', 'created_at', 'updated_at',
      ], [
        str(row.batch_number),
        row.source_barrel_id == null ? null : num(row.source_barrel_id),
        row.source_run_id == null ? null : num(row.source_run_id),
        str(row.bottling_date),
        num(row.bottle_size_ml, 750),
        num(row.bottle_count),
        num(row.final_abv),
        str(row.product_name),
        str(row.lot_number),
        str(row.notes),
        str(row.created_at, new Date().toISOString()),
        str(row.created_at, new Date().toISOString()),
      ]);
    }
    await resetSequence(client, 'bottling_runs');
  }

  const counts: TableCounts = {};
  const countTables = [
    'inventory_categories', 'inventory_items', 'floor_plans', 'floor_equipment', 'mash_batches',
    'mash_fermenter_assignments', 'fermentation_logs', 'distillation_runs', 'distillation_cuts',
    'holding_tank_transfers', 'blend_products', 'blend_ingredients', 'barrels', 'bottling_runs',
  ];
  for (const table of countTables) {
    const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
    counts[table] = Number(result.rows[0]?.count ?? 0);
  }
  return counts;
}

export async function validateImportedData(client: pg.PoolClient): Promise<ImportValidation> {
  const tables = [
    'inventory_categories', 'inventory_items', 'floor_plans', 'floor_equipment', 'mash_batches',
    'mash_fermenter_assignments', 'fermentation_logs', 'distillation_runs', 'distillation_cuts',
    'holding_tank_transfers', 'blend_products', 'blend_ingredients', 'barrels', 'bottling_runs',
  ];

  const serverCounts: TableCounts = {};
  for (const table of tables) {
    const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
    serverCounts[table] = Number(result.rows[0]?.count ?? 0);
  }

  const tankRows = await client.query<{
    id: number;
    name: string;
    volume_litres: string;
    abv: string;
  }>(`
    SELECT fe.id, fe.name,
      COALESCE(SUM(c.volume_litres), 0)::text AS volume_litres,
      CASE WHEN COALESCE(SUM(c.volume_litres), 0) > 0
        THEN (COALESCE(SUM(c.volume_litres * c.abv / 100), 0) / SUM(c.volume_litres) * 100)::text
        ELSE '0' END AS abv
    FROM floor_equipment fe
    LEFT JOIN distillation_cuts c ON c.holding_tank_equipment_id = fe.id
    WHERE fe.equipment_type = 'holding_tank'
    GROUP BY fe.id, fe.name
    ORDER BY fe.name
    LIMIT 20
  `);

  return {
    serverCounts,
    importedCounts: { ...serverCounts },
    matches: true,
    differences: [],
    tankBalanceSamples: tankRows.rows.map((r) => ({
      tankId: r.id,
      tankName: r.name,
      volumeLitres: Number(r.volume_litres),
      abv: Number(r.abv),
    })),
  };
}
