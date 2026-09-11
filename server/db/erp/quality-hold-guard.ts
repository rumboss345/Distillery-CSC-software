import { queryOne } from './pg-helpers.js';

export async function isEntityOnHold(entityType: string, entityId: number): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM qc_holds
     WHERE entity_type = $1 AND entity_id = $2 AND status = 'Active'
     LIMIT 1`,
    [entityType, entityId],
  );
  return row != null;
}

export async function assertEntityNotOnHold(
  entityType: string,
  entityId: number,
  context?: string,
): Promise<void> {
  if (!(await isEntityOnHold(entityType, entityId))) return;
  const hold = await queryOne<{ reason: string }>(
    `SELECT reason FROM qc_holds
     WHERE entity_type = $1 AND entity_id = $2 AND status = 'Active'
     ORDER BY placed_at DESC LIMIT 1`,
    [entityType, entityId],
  );
  const label = context ?? `${entityType} ${entityId}`;
  throw new Error(`Quality hold blocks ${label}: ${hold?.reason ?? 'Active hold'}`);
}
