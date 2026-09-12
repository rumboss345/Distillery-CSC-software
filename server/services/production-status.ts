import {
  PRODUCTION_STATE_MESSAGES,
  type ProductionMigrationState,
  isBrowserAuthoritative,
  isServerAuthoritative,
} from '../../shared/production-state.js';
import { getDatabaseMode, isDatabaseConfigured } from '../config.js';
import type { DatabaseMode } from '../../shared/database-mode.js';
import { pingDatabase, queryOne } from '../db/pool.js';
import {
  getMigrationStateRecord,
  isServerApiCutoverReady,
  type MigrationStateRecord,
} from './migration-state.js';

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
  databaseMode: DatabaseMode;
  migrationState: ProductionMigrationState;
  statusMessage: string;
  browserAuthoritative: boolean;
  serverAuthoritative: boolean;
  serverApiCutoverReady: boolean;
  canActivateCentralDatabase: boolean;
  activateBlockedReason: string | null;
  canonicalLiquidUnit: 'L';
  abvConvention: 'percentage_0_100';
  gallonConversion: 'US_liquid_gallon';
  recordCounts: Record<string, number>;
  importMetadata: {
    lastImportAt: string | null;
    lastImportedByEmail: string | null;
    lastImportStatus: string | null;
    lastImportRunId: number | null;
  };
  migration: MigrationStateRecord;
}

export async function getProductionStatus(): Promise<ProductionStatus> {
  const databaseConfigured = isDatabaseConfigured();
  const databaseConnected = databaseConfigured ? await pingDatabase() : false;

  const recordCounts: Record<string, number> = {};
  if (databaseConnected) {
    for (const table of COUNT_TABLES) {
      const row = await queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
      recordCounts[table] = Number(row?.count ?? 0);
    }
  }

  let migrationState: ProductionMigrationState = 'LOCAL_ONLY';
  let migration: MigrationStateRecord = {
    state: 'LOCAL_ONLY',
    updatedAt: null,
    updatedByEmail: null,
    lastImportRunId: null,
  };

  if (!databaseConfigured || !databaseConnected) {
    migrationState = 'LOCAL_ONLY';
  } else {
    migration = await getMigrationStateRecord();
    migrationState = migration.state;
  }

  const serverApiCutoverReady = databaseConnected ? await isServerApiCutoverReady() : false;
  const serverAuthoritative = isServerAuthoritative(migrationState);
  const browserAuthoritative = isBrowserAuthoritative(migrationState);

  let canActivate = false;
  let activateBlockedReason: string | null = null;

  if (migrationState === 'MIGRATION_IMPORTED' || migrationState === 'SERVER_READ_ONLY_VALIDATION') {
    if (!serverApiCutoverReady) {
      activateBlockedReason =
        'Server production API is not ready. Step 1A must route production writes through Express before cutover.';
    } else {
      canActivate = true;
    }
  } else if (migrationState === 'SERVER_AUTHORITATIVE') {
    activateBlockedReason = 'Central database is already active.';
  } else {
    activateBlockedReason = 'Complete a successful import and validation before activating the central database.';
  }

  const importRun = databaseConnected
    ? await queryOne<{
        id: number;
        created_at: string;
        imported_by_email: string | null;
        status: string;
      }>(
        `SELECT id, created_at, imported_by_email, status FROM data_import_runs
         WHERE status = 'imported' ORDER BY id DESC LIMIT 1`,
      )
    : null;

  return {
    databaseConfigured,
    databaseConnected,
    databaseMode: getDatabaseMode(),
    migrationState,
    statusMessage: PRODUCTION_STATE_MESSAGES[migrationState],
    browserAuthoritative,
    serverAuthoritative,
    serverApiCutoverReady,
    canActivateCentralDatabase: canActivate,
    activateBlockedReason,
    canonicalLiquidUnit: 'L',
    abvConvention: 'percentage_0_100',
    gallonConversion: 'US_liquid_gallon',
    recordCounts,
    importMetadata: {
      lastImportAt: importRun?.created_at ?? null,
      lastImportedByEmail: importRun?.imported_by_email ?? null,
      lastImportStatus: importRun?.status ?? null,
      lastImportRunId: importRun?.id ?? migration.lastImportRunId,
    },
    migration,
  };
}
