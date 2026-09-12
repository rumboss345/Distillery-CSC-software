import type pg from 'pg';
import { insertRow, nextBusinessCode, queryOne, runQuery, withPgTransaction } from '../pg-helpers.js';
import { isEntityOnHold } from '../quality-hold-guard.js';

const now = () => new Date().toISOString();

export interface PlaceHoldInput {
  entityType: string;
  entityId: number;
  reason: string;
  placedBy?: string | null;
}

export interface ReleaseHoldInput {
  holdId: number;
  releasedBy?: string | null;
  releaseNotes?: string | null;
}

export async function placeHold(input: PlaceHoldInput): Promise<number> {
  if (await isEntityOnHold(input.entityType, input.entityId)) {
    throw new Error('An active hold already exists for this entity.');
  }

  return withPgTransaction(async (client) => {
    const code = await nextBusinessCode('qcHold', 'qc_holds', 'hold_code', 4, client);
    const holdId = await insertRow(
      `INSERT INTO qc_holds (
        hold_code, entity_type, entity_id, reason, status, placed_at, placed_by, created_at
      ) VALUES ($1, $2, $3, $4, 'Active', $5, $6, $7)`,
      [code, input.entityType, input.entityId, input.reason, now(), input.placedBy ?? null, now()],
      client,
    );

    await updateEntityHoldStatus(client, input.entityType, input.entityId, true);
    return holdId;
  });
}

export async function releaseHold(input: ReleaseHoldInput): Promise<void> {
  await withPgTransaction(async (client) => {
    const hold = await queryOne<{
      id: number;
      status: string;
      entity_type: string;
      entity_id: number;
    }>('SELECT id, status, entity_type, entity_id FROM qc_holds WHERE id = $1', [input.holdId], client);
    if (!hold) throw new Error('Hold not found.');
    if (hold.status !== 'Active') throw new Error('Hold is not active.');

    await runQuery(
      `UPDATE qc_holds SET status = 'Released', released_at = $1, released_by = $2, release_notes = $3 WHERE id = $4`,
      [now(), input.releasedBy ?? null, input.releaseNotes ?? null, input.holdId],
      client,
    );

    if (!(await isEntityOnHold(hold.entity_type, hold.entity_id))) {
      await updateEntityHoldStatus(client, hold.entity_type, hold.entity_id, false);
    }
  });
}

async function updateEntityHoldStatus(
  client: pg.PoolClient,
  entityType: string,
  entityId: number,
  onHold: boolean,
): Promise<void> {
  const ts = now();
  if (entityType === 'fg_lot') {
    if (onHold) {
      await runQuery(
        `UPDATE fg_lots SET status = 'Hold', quality_status = 'Hold', updated_at = $1 WHERE id = $2`,
        [ts, entityId],
        client,
      );
    } else {
      await runQuery(
        `UPDATE fg_lots SET status = 'Available', quality_status = 'Passed', updated_at = $1 WHERE id = $2 AND status = 'Hold'`,
        [ts, entityId],
        client,
      );
    }
  } else if (entityType === 'liq_lot') {
    const status = onHold ? 'Hold' : 'Active';
    await runQuery(
      `UPDATE liq_lots SET status = $1, updated_at = $2 WHERE id = $3${onHold ? '' : " AND status = 'Hold'"}`,
      [status, ts, entityId],
      client,
    );
  } else if (entityType === 'mat_lot') {
    const status = onHold ? 'Hold' : 'Active';
    await runQuery(
      `UPDATE mat_lots SET status = $1, updated_at = $2 WHERE id = $3${onHold ? '' : " AND status = 'Hold'"}`,
      [status, ts, entityId],
      client,
    );
  }
}
