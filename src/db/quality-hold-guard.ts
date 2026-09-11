import type { QcHold } from '../types/quality';
import { queryOne } from './database';

function qualityHoldsTableReady(): boolean {
  return queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='qc_holds'",
  ) != null;
}

export function isEntityOnHold(entityType: string, entityId: number): boolean {
  if (!qualityHoldsTableReady()) return false;
  const row = queryOne<{ id: number }>(
    `SELECT id FROM qc_holds WHERE entity_type = ? AND entity_id = ? AND status = 'Active' LIMIT 1`,
    [entityType, entityId],
  );
  return row != null;
}

export function assertEntityNotOnHold(entityType: string, entityId: number, context?: string): void {
  if (isEntityOnHold(entityType, entityId)) {
    const hold = queryOne<QcHold>(
      `SELECT * FROM qc_holds WHERE entity_type = ? AND entity_id = ? AND status = 'Active' ORDER BY placed_at DESC LIMIT 1`,
      [entityType, entityId],
    );
    const label = context ?? `${entityType} ${entityId}`;
    throw new Error(`Quality hold blocks ${label}: ${hold?.reason ?? 'Active hold'}`);
  }
}
