import type pg from 'pg';
import type { ProductionMigrationState } from '../../shared/production-state.js';
import { isDatabaseConfigured } from '../config.js';
import { query, queryOne } from '../db/pool.js';

export interface MigrationStateRecord {
  state: ProductionMigrationState;
  updatedAt: string | null;
  updatedByEmail: string | null;
  lastImportRunId: number | null;
}

export async function getMigrationStateRecord(): Promise<MigrationStateRecord> {
  if (!isDatabaseConfigured()) {
    return {
      state: 'LOCAL_ONLY',
      updatedAt: null,
      updatedByEmail: null,
      lastImportRunId: null,
    };
  }

  const row = await queryOne<{ value: MigrationStateRecord }>(
    `SELECT value FROM app_settings WHERE key = 'production_migration_state'`,
  );
  const lastImport = await queryOne<{ id: number }>(
    `SELECT id FROM data_import_runs WHERE status = 'imported' ORDER BY id DESC LIMIT 1`,
  );

  const stored = row?.value as Partial<MigrationStateRecord> | undefined;
  let state = stored?.state ?? 'MIGRATION_READY';

  if (state === 'MIGRATION_READY' && lastImport) {
    state = 'MIGRATION_IMPORTED';
  }

  return {
    state,
    updatedAt: stored?.updatedAt ?? null,
    updatedByEmail: stored?.updatedByEmail ?? null,
    lastImportRunId: lastImport?.id ?? stored?.lastImportRunId ?? null,
  };
}

export async function setMigrationState(
  state: ProductionMigrationState,
  meta: { updatedByEmail?: string; lastImportRunId?: number | null } = {},
  client?: pg.PoolClient,
): Promise<void> {
  const payload = {
    state,
    updatedAt: new Date().toISOString(),
    updatedByEmail: meta.updatedByEmail ?? null,
    lastImportRunId: meta.lastImportRunId ?? null,
  };
  const sql = `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('production_migration_state', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
  if (client) {
    await client.query(sql, [JSON.stringify(payload)]);
  } else {
    await query(sql, [JSON.stringify(payload)]);
  }
}

export async function isServerApiCutoverReady(): Promise<boolean> {
  const row = await queryOne<{ value: { ready?: boolean } }>(
    `SELECT value FROM app_settings WHERE key = 'server_api_cutover_ready'`,
  );
  return Boolean(row?.value?.ready);
}

export async function hasSuccessfulImport(): Promise<boolean> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM data_import_runs WHERE status = 'imported'`,
  );
  return Number(row?.count ?? 0) > 0;
}
