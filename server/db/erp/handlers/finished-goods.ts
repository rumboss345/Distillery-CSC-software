import type pg from 'pg';
import { FG_TRANSACTION_TYPES } from '../../../../shared/finished-goods/constants.js';
import { computeFgLotBalance } from '../balance-engine.js';
import { assertEntityNotOnHold } from '../quality-hold-guard.js';
import { insertRow, nextBusinessCode, queryOne, withPgTransaction } from '../pg-helpers.js';

const now = () => new Date().toISOString();

let fgGroupSeq = 0;
function nextFgGroupId(): string {
  fgGroupSeq += 1;
  return `FGO-${String(fgGroupSeq).padStart(6, '0')}-${Date.now()}`;
}

async function insertFgTransaction(
  client: pg.PoolClient,
  input: {
    transactionType: string;
    fgLotId: number;
    skuId: number;
    sourceLocationId?: number | null;
    destinationLocationId?: number | null;
    quantity: number;
    transactionGroupId?: string | null;
    referenceType?: string | null;
    referenceId?: number | null;
    unitCostKyd?: number | null;
    reasonCode?: string | null;
    notes?: string;
    createdBy?: string | null;
  },
): Promise<number> {
  if (!FG_TRANSACTION_TYPES.includes(input.transactionType as (typeof FG_TRANSACTION_TYPES)[number])) {
    throw new Error(`Invalid finished goods transaction type: ${input.transactionType}`);
  }
  const code = await nextBusinessCode('fgTransaction', 'fg_transactions', 'transaction_code', 4, client);
  const extended = input.unitCostKyd != null ? input.unitCostKyd * input.quantity : null;
  return insertRow(
    `INSERT INTO fg_transactions (
      transaction_code, transaction_type, transaction_timestamp, fg_lot_id, sku_id,
      source_location_id, destination_location_id, quantity, base_quantity, base_unit,
      transaction_group_id, reference_type, reference_id, unit_cost_kyd_snapshot,
      extended_cost_kyd, reason_code, notes, created_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'each', $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      code,
      input.transactionType,
      now(),
      input.fgLotId,
      input.skuId,
      input.sourceLocationId ?? null,
      input.destinationLocationId ?? null,
      input.quantity,
      input.quantity,
      input.transactionGroupId ?? null,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.unitCostKyd ?? null,
      extended,
      input.reasonCode ?? null,
      input.notes ?? '',
      input.createdBy ?? null,
      now(),
    ],
    client,
  );
}

export async function insertFgTransactionRow(
  input: Parameters<typeof insertFgTransaction>[1],
): Promise<number> {
  return withPgTransaction((client) => insertFgTransaction(client, input));
}

export async function transferFgLot(input: {
  fgLotId: number;
  sourceLocationId: number;
  destinationLocationId: number;
  quantity: number;
  notes?: string;
  createdBy?: string | null;
}): Promise<number> {
  return withPgTransaction(async (client) => {
    if (input.sourceLocationId === input.destinationLocationId) {
      throw new Error('Source and destination locations must differ.');
    }
    const lot = await queryOne<{ sku_id: number; unit_cost_kyd: number | null }>(
      'SELECT sku_id, unit_cost_kyd FROM fg_lots WHERE id = $1',
      [input.fgLotId],
      client,
    );
    if (!lot) throw new Error('Finished goods lot not found.');

    const balance = await computeFgLotBalance(input.fgLotId, input.sourceLocationId);
    if (balance < input.quantity) {
      throw new Error(`Insufficient quantity at source location (${balance} available).`);
    }

    const groupId = nextFgGroupId();
    const unitCost = lot.unit_cost_kyd;

    await insertFgTransaction(client, {
      transactionType: 'Transfer Out',
      fgLotId: input.fgLotId,
      skuId: lot.sku_id,
      sourceLocationId: input.sourceLocationId,
      quantity: input.quantity,
      transactionGroupId: groupId,
      unitCostKyd: unitCost,
      notes: input.notes ?? '',
      createdBy: input.createdBy,
    });

    return insertFgTransaction(client, {
      transactionType: 'Transfer In',
      fgLotId: input.fgLotId,
      skuId: lot.sku_id,
      destinationLocationId: input.destinationLocationId,
      quantity: input.quantity,
      transactionGroupId: groupId,
      unitCostKyd: unitCost,
      notes: input.notes ?? '',
      createdBy: input.createdBy,
    });
  });
}

export type PostFgShipmentInput = {
  fgLotId: number;
  sourceLocationId: number;
  quantity: number;
  referenceType?: string | null;
  referenceId?: number | null;
  notes?: string;
  createdBy?: string | null;
};

export async function postFgShipmentWithClient(
  client: pg.PoolClient,
  input: PostFgShipmentInput,
): Promise<number> {
  const lot = await queryOne<{ sku_id: number; fg_lot_code: string; unit_cost_kyd: number | null }>(
    'SELECT sku_id, fg_lot_code, unit_cost_kyd FROM fg_lots WHERE id = $1',
    [input.fgLotId],
    client,
  );
  if (!lot) throw new Error('Finished goods lot not found.');

  await assertEntityNotOnHold('fg_lot', input.fgLotId, `shipment for FG lot ${lot.fg_lot_code}`);

  const balance = await computeFgLotBalance(input.fgLotId, input.sourceLocationId);
  if (balance < input.quantity) {
    throw new Error(`Insufficient quantity for shipment (${balance} available).`);
  }

  return insertFgTransaction(client, {
    transactionType: 'Shipment',
    fgLotId: input.fgLotId,
    skuId: lot.sku_id,
    sourceLocationId: input.sourceLocationId,
    quantity: input.quantity,
    referenceType: input.referenceType ?? 'shipment',
    referenceId: input.referenceId ?? null,
    unitCostKyd: lot.unit_cost_kyd,
    notes: input.notes ?? 'FG shipment',
    createdBy: input.createdBy,
  });
}

export async function postFgShipment(input: PostFgShipmentInput): Promise<number> {
  return withPgTransaction((client) => postFgShipmentWithClient(client, input));
}
