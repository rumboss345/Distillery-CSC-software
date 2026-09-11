/**
 * Step 1A — dual_validation mode: log browser vs PostgreSQL snapshots without blocking browser authority.
 */
import { getDatabaseMode } from '../config.js';
import { dualValidationEnabled } from '../../shared/database-mode.js';
import { query } from '../db/pool.js';

export interface DualValidationEntry {
  operationType: string;
  entityType?: string;
  entityId?: number;
  browserSnapshot: unknown;
  postgresSnapshot: unknown;
  matchStatus: 'match' | 'mismatch' | 'skipped';
  notes?: string;
}

export function isDualValidationActive(): boolean {
  return dualValidationEnabled(getDatabaseMode());
}

export async function logDualValidation(entry: DualValidationEntry): Promise<void> {
  if (!isDualValidationActive()) return;
  await query(
    `INSERT INTO erp_dual_validation_log
      (operation_type, entity_type, entity_id, browser_snapshot, postgres_snapshot, match_status, notes)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
    [
      entry.operationType,
      entry.entityType ?? null,
      entry.entityId ?? null,
      JSON.stringify(entry.browserSnapshot ?? null),
      JSON.stringify(entry.postgresSnapshot ?? null),
      entry.matchStatus,
      entry.notes ?? '',
    ],
  );
}

export function compareNumeric(a: number, b: number, tolerance = 0.001): boolean {
  return Math.abs(a - b) <= tolerance;
}
