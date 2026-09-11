import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ImportPreview, SqlJsRow, TableCounts } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

async function getSql() {
  if (!sqlPromise) {
    const wasmPath = join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    sqlPromise = initSqlJs({
      locateFile: () => wasmPath,
    });
  }
  return sqlPromise;
}

export async function openSqlJsDatabase(base64Payload: string): Promise<Database> {
  const SQL = await getSql();
  const binary = Uint8Array.from(Buffer.from(base64Payload, 'base64'));
  return new SQL.Database(binary);
}

function tableExists(db: Database, table: string): boolean {
  const row = db.exec(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${table.replace(/'/g, "''")}'`,
  );
  return row.length > 0 && row[0].values.length > 0;
}

function countTable(db: Database, table: string): number {
  if (!tableExists(db, table)) return 0;
  const result = db.exec(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(result[0]?.values[0]?.[0] ?? 0);
}

function selectAll(db: Database, table: string): SqlJsRow[] {
  if (!tableExists(db, table)) return [];
  const result = db.exec(`SELECT * FROM ${table}`);
  if (!result[0]) return [];
  const columns = result[0].columns;
  return result[0].values.map((values) => {
    const row: SqlJsRow = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row;
  });
}

export function collectPreview(db: Database, sourceLabel: string): ImportPreview {
  const tables: TableCounts = {
    inventory_categories: countTable(db, 'inventory_categories'),
    inventory_items: countTable(db, 'inventory_items'),
    mash_batches: countTable(db, 'mash_batches'),
    fermentation_logs: countTable(db, 'fermentation_logs'),
    mash_fermenter_assignments: countTable(db, 'mash_fermenter_assignments'),
    distillation_runs: countTable(db, 'distillation_runs'),
    distillation_cuts: countTable(db, 'distillation_cuts'),
    holding_tank_transfers: countTable(db, 'holding_tank_transfers'),
    blend_products: countTable(db, 'blend_products'),
    blend_ingredients: countTable(db, 'blend_ingredients'),
    barrels: countTable(db, 'barrels'),
    bottling_runs: countTable(db, 'bottling_runs'),
    floor_plans: countTable(db, 'floor_plans'),
    floor_equipment: countTable(db, 'floor_equipment'),
  };

  const warnings: string[] = [];
  if (tables.mash_batches === 0 && tables.distillation_runs === 0 && tables.floor_equipment === 0) {
    warnings.push('This database appears empty or unrecognized.');
  }

  return {
    sourceLabel,
    tables,
    batchNumbers: {
      mash: selectAll(db, 'mash_batches').map((r) => String(r.batch_number ?? '')),
      distillation: selectAll(db, 'distillation_runs').map((r) => String(r.batch_number ?? '')),
      blend: selectAll(db, 'blend_products').map((r) => String(r.batch_number ?? '')),
      bottling: selectAll(db, 'bottling_runs').map((r) => String(r.batch_number ?? '')),
    },
    warnings,
  };
}

export { selectAll, tableExists, countTable };
