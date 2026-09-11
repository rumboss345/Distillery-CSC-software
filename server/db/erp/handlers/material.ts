import type pg from 'pg';
import { LEGACY_RECEIPT_BLOCK_MESSAGE } from '../../../../shared/material-inventory/constants.js';
import type { MaterialType } from '../../../../shared/material-inventory/constants.js';
import {
  validateDiscreteBaseQuantity,
  validateLotIssueable,
  validateMaterialIdentity,
  validatePositiveQuantity,
  validateSufficientMaterialBalance,
} from '../../../../shared/material-inventory/validation.js';
import { computeMaterialLotBalance } from '../balance-engine.js';
import {
  insertRow,
  nextBusinessCode,
  queryOne,
  withPgTransaction,
} from '../pg-helpers.js';

const now = () => new Date().toISOString();

export interface PostMaterialTransactionInput {
  transactionType: string;
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId?: number | null;
  sourceLocationId?: number | null;
  destinationLocationId?: number | null;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  transactionGroupId?: string | null;
  transactionTimestamp?: string;
  reasonCode?: string | null;
  sourceDocumentType?: string | null;
  sourceDocumentId?: number | null;
  purchaseOrderId?: number | null;
  receiptId?: number | null;
  productionOrderId?: number | null;
  productionBatchId?: number | null;
  unitCost?: number | null;
  costUnit?: string | null;
  currency?: string | null;
  notes?: string;
  createdBy?: string | null;
}

export interface TransferMaterialInput {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId: number;
  sourceLocationId: number;
  destinationLocationId: number;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  notes?: string;
  createdBy?: string | null;
}

async function getMaterialTrackingMode(
  client: pg.PoolClient,
  materialType: MaterialType,
  materialId: number,
): Promise<'LEGACY' | 'LEDGER'> {
  if (materialType === 'RAW_MATERIAL') {
    const row = await queryOne<{ inventory_tracking_mode: string }>(
      'SELECT inventory_tracking_mode FROM md_raw_materials WHERE id = $1',
      [materialId],
      client,
    );
    return (row?.inventory_tracking_mode ?? 'LEGACY') as 'LEGACY' | 'LEDGER';
  }
  const row = await queryOne<{ inventory_tracking_mode: string }>(
    'SELECT inventory_tracking_mode FROM md_packaging_materials WHERE id = $1',
    [materialId],
    client,
  );
  return (row?.inventory_tracking_mode ?? 'LEGACY') as 'LEGACY' | 'LEDGER';
}

async function assertLedgerMaterial(
  client: pg.PoolClient,
  materialType: MaterialType,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
): Promise<void> {
  validateMaterialIdentity({ materialType, rawMaterialId, packagingMaterialId });
  const materialId = (rawMaterialId ?? packagingMaterialId)!;
  const mode = await getMaterialTrackingMode(client, materialType, materialId);
  if (mode !== 'LEDGER') throw new Error(LEGACY_RECEIPT_BLOCK_MESSAGE);
}

async function nextMaterialGroupId(client: pg.PoolClient): Promise<string> {
  return nextBusinessCode('materialOperationGroup', 'mat_transactions', 'transaction_group_id', 4, client);
}

async function validatePostWouldNotGoNegative(
  input: PostMaterialTransactionInput,
): Promise<void> {
  if (input.sourceLocationId != null && input.materialLotId != null) {
    const avail = await computeMaterialLotBalance(input.materialLotId, input.sourceLocationId);
    validateSufficientMaterialBalance(
      avail,
      input.baseQuantity,
      `lot ${input.materialLotId} at location ${input.sourceLocationId}`,
    );
  }
}

async function insertMaterialTransaction(
  client: pg.PoolClient,
  input: PostMaterialTransactionInput,
): Promise<number> {
  validateMaterialIdentity({
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
  });
  validatePositiveQuantity(input.baseQuantity, 'Base quantity');
  validateDiscreteBaseQuantity(input.baseQuantity, input.baseUnit);

  if (
    input.materialLotId != null &&
    (input.transactionType === 'Production Issue' || input.transactionType === 'Location Transfer Out')
  ) {
    const lot = await queryOne<{ status: string; expiration_date: string | null }>(
      'SELECT status, expiration_date FROM mat_lots WHERE id = $1',
      [input.materialLotId],
      client,
    );
    if (lot) validateLotIssueable(lot.status, lot.expiration_date);
  }

  if (input.sourceLocationId != null) {
    await validatePostWouldNotGoNegative(input);
  }

  const code = await nextBusinessCode('materialTransaction', 'mat_transactions', 'transaction_code', 4, client);
  return insertRow(
    `INSERT INTO mat_transactions (
      transaction_code, transaction_group_id, transaction_type, transaction_timestamp,
      material_type, raw_material_id, packaging_material_id, material_lot_id,
      source_location_id, destination_location_id, quantity, unit, base_quantity, base_unit,
      reason_code, source_document_type, source_document_id, purchase_order_id, receipt_id,
      production_order_id, production_batch_id, unit_cost, cost_unit, currency, notes, created_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
    [
      code,
      input.transactionGroupId ?? null,
      input.transactionType,
      input.transactionTimestamp ?? now(),
      input.materialType,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
      input.materialLotId ?? null,
      input.sourceLocationId ?? null,
      input.destinationLocationId ?? null,
      input.quantity,
      input.unit,
      input.baseQuantity,
      input.baseUnit,
      input.reasonCode ?? null,
      input.sourceDocumentType ?? null,
      input.sourceDocumentId ?? null,
      input.purchaseOrderId ?? null,
      input.receiptId ?? null,
      input.productionOrderId ?? null,
      input.productionBatchId ?? null,
      input.unitCost ?? null,
      input.costUnit ?? null,
      input.currency ?? null,
      input.notes ?? '',
      input.createdBy ?? null,
      now(),
    ],
    client,
  );
}

export async function postMaterialTransaction(input: PostMaterialTransactionInput): Promise<number> {
  return withPgTransaction(async (client) => {
    await assertLedgerMaterial(
      client,
      input.materialType,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
    );
    return insertMaterialTransaction(client, input);
  });
}

export async function transferMaterial(input: TransferMaterialInput): Promise<string> {
  return withPgTransaction(async (client) => {
    await assertLedgerMaterial(
      client,
      input.materialType,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
    );

    const lot = await queryOne<{ status: string }>(
      'SELECT status FROM mat_lots WHERE id = $1',
      [input.materialLotId],
      client,
    );
    if (!lot) throw new Error('Material lot not found.');
    validateLotIssueable(lot.status);

    const groupId = await nextMaterialGroupId(client);

    await insertMaterialTransaction(client, {
      transactionType: 'Location Transfer Out',
      materialType: input.materialType,
      rawMaterialId: input.rawMaterialId,
      packagingMaterialId: input.packagingMaterialId,
      materialLotId: input.materialLotId,
      sourceLocationId: input.sourceLocationId,
      quantity: input.quantity,
      unit: input.unit,
      baseQuantity: input.baseQuantity,
      baseUnit: input.baseUnit,
      transactionGroupId: groupId,
      notes: input.notes,
      createdBy: input.createdBy,
    });

    await insertMaterialTransaction(client, {
      transactionType: 'Location Transfer In',
      materialType: input.materialType,
      rawMaterialId: input.rawMaterialId,
      packagingMaterialId: input.packagingMaterialId,
      materialLotId: input.materialLotId,
      destinationLocationId: input.destinationLocationId,
      quantity: input.quantity,
      unit: input.unit,
      baseQuantity: input.baseQuantity,
      baseUnit: input.baseUnit,
      transactionGroupId: groupId,
      notes: input.notes,
      createdBy: input.createdBy,
    });

    return groupId;
  });
}

export async function postMaterialOpeningBalance(input: {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId: number;
  locationId: number;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  effectiveDate?: string;
  notes?: string;
  createdBy?: string | null;
}): Promise<number> {
  return withPgTransaction(async (client) => {
    await assertLedgerMaterial(
      client,
      input.materialType,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
    );

    const existing = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM mat_transactions
       WHERE material_lot_id = $1 AND destination_location_id = $2 AND transaction_type = 'Opening Balance'
         AND reversal_of_transaction_id IS NULL
         AND id NOT IN (
           SELECT reversal_of_transaction_id FROM mat_transactions
           WHERE reversal_of_transaction_id IS NOT NULL
         )`,
      [input.materialLotId, input.locationId],
      client,
    );
    if (Number(existing?.count ?? 0) > 0) {
      throw new Error('Opening Balance already exists for this material lot at this location.');
    }

    return insertMaterialTransaction(client, {
      transactionType: 'Opening Balance',
      materialType: input.materialType,
      rawMaterialId: input.rawMaterialId,
      packagingMaterialId: input.packagingMaterialId,
      materialLotId: input.materialLotId,
      destinationLocationId: input.locationId,
      quantity: input.quantity,
      unit: input.unit,
      baseQuantity: input.baseQuantity,
      baseUnit: input.baseUnit,
      transactionTimestamp: input.effectiveDate ?? now(),
      notes: input.notes ?? 'Opening balance',
      createdBy: input.createdBy,
    });
  });
}
