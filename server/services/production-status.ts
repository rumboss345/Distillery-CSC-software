import { isDatabaseConfigured } from '../config.js';
import { pingDatabase, query, queryOne } from '../db/pool.js';

const COUNT_TABLES = [
  'inventory_categories',
  'inventory_items',
  'mash_batches',
  'distillation_runs',
  'distillation_cuts',
  'blend_products',
  'barrels',
  'bottling_runs',
  'floor_equipment',
  'holding_tank_transfers',
] as const;

export interface ProductionStatus {
  databaseConfigured: boolean;
  databaseConnected: boolean;
  productionInitialized: boolean;
  authoritativeSource: 'server' | 'browser_local';
  canonicalLiquidUnit: 'L';
  abvConvention: 'percentage_0_100';
  recordCounts: Record<string, number>;
  importMetadata: {
    lastImportAt: string | null;
    lastImportedByEmail: string | null;
    lastImportStatus: string | null;
  };
}

export async function getProductionStatus(): Promise<ProductionStatus> {
  const databaseConfigured = isDatabaseConfigured();
  const databaseConnected = databaseConfigured ? await pingDatabase() : false;

  const recordCounts: Record<string, number> = {};
  let totalRecords = 0;

  if (databaseConnected) {
    for (const table of COUNT_TABLES) {
      const row = await queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
      const count = Number(row?.count ?? 0);
      recordCounts[table] = count;
      totalRecords += count;
    }
  }

  const importRun = databaseConnected
    ? await queryOne<{
        created_at: string;
        imported_by_email: string | null;
        status: string;
      }>(
        `SELECT created_at, imported_by_email, status FROM data_import_runs
         WHERE status = 'imported' ORDER BY id DESC LIMIT 1`,
      )
    : null;

  const setting = databaseConnected
    ? await queryOne<{ value: { authoritative?: boolean } }>(
        `SELECT value FROM app_settings WHERE key = 'production'`,
      )
    : null;

  const productionInitialized = totalRecords > 0 || Boolean(setting?.value?.authoritative);

  return {
    databaseConfigured,
    databaseConnected,
    productionInitialized,
    authoritativeSource: productionInitialized && databaseConnected ? 'server' : 'browser_local',
    canonicalLiquidUnit: 'L',
    abvConvention: 'percentage_0_100',
    recordCounts,
    importMetadata: {
      lastImportAt: importRun?.created_at ?? null,
      lastImportedByEmail: importRun?.imported_by_email ?? null,
      lastImportStatus: importRun?.status ?? null,
    },
  };
}

export async function markProductionAuthoritative(userEmail: string) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('production', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify({ authoritative: true, switchedAt: new Date().toISOString(), by: userEmail })],
  );
}

export async function serverHasProductionData(): Promise<boolean> {
  const row = await queryOne<{ total: string }>(`
    SELECT (
      (SELECT COUNT(*) FROM mash_batches) +
      (SELECT COUNT(*) FROM distillation_runs) +
      (SELECT COUNT(*) FROM floor_equipment) +
      (SELECT COUNT(*) FROM inventory_items)
    )::text AS total
  `);
  return Number(row?.total ?? 0) > 0;
}
