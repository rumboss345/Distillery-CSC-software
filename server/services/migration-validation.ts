import type { Database } from 'sql.js';
import type pg from 'pg';
import { collectPreview } from './sqljs-import/parser.js';
import { computeBrowserTankBalances, computeServerTankBalances, type TankBalance } from './tank-balance.js';

export interface ValidationRow {
  key: string;
  label: string;
  browser: number | string;
  server: number | string;
  difference: number | string;
  status: 'PASS' | 'FAIL' | 'WARN';
  critical: boolean;
}

export interface MigrationValidationReport {
  passed: boolean;
  rows: ValidationRow[];
  batchNumbers: ValidationRow[];
  tankBalances: Array<{
    tankId: number;
    tankName: string;
    browserVolumeLitres: number;
    serverVolumeLitres: number;
    browserAbv: number;
    serverAbv: number;
    status: 'PASS' | 'FAIL';
  }>;
}

const COUNT_CHECKS: Array<{ table: string; label: string; critical: boolean }> = [
  { table: 'inventory_items', label: 'Inventory items', critical: true },
  { table: 'mash_batches', label: 'Mash batches', critical: true },
  { table: 'fermentation_logs', label: 'Fermentation logs', critical: true },
  { table: 'distillation_runs', label: 'Distillation runs', critical: true },
  { table: 'distillation_cuts', label: 'Distillation cuts', critical: true },
  { table: 'holding_tank_transfers', label: 'Tank transfers', critical: true },
  { table: 'blend_products', label: 'Blend records', critical: true },
  { table: 'barrels', label: 'Barrel records', critical: true },
  { table: 'bottling_runs', label: 'Bottling records', critical: true },
  { table: 'floor_equipment', label: 'Floor equipment', critical: true },
  { table: 'inventory_categories', label: 'Inventory categories', critical: false },
  { table: 'floor_plans', label: 'Floor plans', critical: false },
  { table: 'blend_ingredients', label: 'Blend ingredients', critical: false },
  { table: 'mash_fermenter_assignments', label: 'Fermenter assignments', critical: false },
];

async function serverTableCount(client: pg.PoolClient, table: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${table}`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

function compareTankBalances(browser: TankBalance[], server: TankBalance[]) {
  const serverMap = new Map(server.map((t) => [t.tankId, t]));
  const browserMap = new Map(browser.map((t) => [t.tankId, t]));
  const allIds = new Set([...serverMap.keys(), ...browserMap.keys()]);

  return [...allIds].map((tankId) => {
    const b = browserMap.get(tankId);
    const s = serverMap.get(tankId);
    const browserVol = b?.volumeLitres ?? 0;
    const serverVol = s?.volumeLitres ?? 0;
    const volDiff = Math.abs(browserVol - serverVol);
    const abvDiff = Math.abs((b?.abv ?? 0) - (s?.abv ?? 0));
    const status = volDiff <= 0.05 && abvDiff <= 0.05 ? 'PASS' as const : 'FAIL' as const;
    return {
      tankId,
      tankName: b?.tankName ?? s?.tankName ?? `Tank ${tankId}`,
      browserVolumeLitres: browserVol,
      serverVolumeLitres: serverVol,
      browserAbv: b?.abv ?? 0,
      serverAbv: s?.abv ?? 0,
      status,
    };
  }).filter((t) => t.browserVolumeLitres > 0 || t.serverVolumeLitres > 0);
}

export async function buildMigrationValidationReport(
  browserDb: Database,
  client: pg.PoolClient,
): Promise<MigrationValidationReport> {
  const preview = collectPreview(browserDb, 'validation');
  const rows: ValidationRow[] = [];

  for (const check of COUNT_CHECKS) {
    const browserCount = preview.tables[check.table] ?? 0;
    const serverCount = await serverTableCount(client, check.table);
    const diff = serverCount - browserCount;
    rows.push({
      key: check.table,
      label: check.label,
      browser: browserCount,
      server: serverCount,
      difference: diff,
      status: diff === 0 ? 'PASS' : 'FAIL',
      critical: check.critical,
    });
  }

  const batchNumbers: ValidationRow[] = [];
  for (const [label, key] of [
    ['Mash batch numbers', 'mash'],
    ['Distillation batch numbers', 'distillation'],
    ['Blend batch numbers', 'blend'],
    ['Bottling batch numbers', 'bottling'],
  ] as const) {
    const browserList = preview.batchNumbers[key];
    const col = key === 'mash' ? 'mash_batches'
      : key === 'distillation' ? 'distillation_runs'
        : key === 'blend' ? 'blend_products' : 'bottling_runs';
    const serverRows = await client.query<{ batch_number: string }>(
      `SELECT batch_number FROM ${col} ORDER BY batch_number`,
    );
    const serverList = serverRows.rows.map((r) => r.batch_number).sort();
    const browserSorted = [...browserList].sort();
    const match = JSON.stringify(browserSorted) === JSON.stringify(serverList);
    batchNumbers.push({
      key: `${key}_batch_numbers`,
      label,
      browser: browserSorted.length,
      server: serverList.length,
      difference: serverList.length - browserSorted.length,
      status: match ? 'PASS' : 'FAIL',
      critical: true,
    });
  }

  const browserTanks = computeBrowserTankBalances(browserDb);
  const serverTanks = await computeServerTankBalances(client);
  const tankBalances = compareTankBalances(browserTanks, serverTanks);

  const criticalFail = rows.some((r) => r.critical && r.status === 'FAIL')
    || batchNumbers.some((r) => r.critical && r.status === 'FAIL')
    || tankBalances.some((t) => t.status === 'FAIL');

  return {
    passed: !criticalFail,
    rows,
    batchNumbers,
    tankBalances,
  };
}
