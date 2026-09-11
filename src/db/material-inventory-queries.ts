import {
  aggregateLotBalance,
  aggregateLotBalanceByLocation,
  aggregateMaterialBalance,
  aggregateMaterialBalanceByLocation,
  type MaterialLedgerRow,
} from '../../shared/material-inventory/balance-engine';
import {
  MAT_LOOKUP_TYPES,
  MAT_SOURCE_DOCUMENT_TYPES,
  type MaterialType,
} from '../../shared/material-inventory/constants';
import { normalizeToBaseUnit } from '../../shared/material-inventory/uom-conversion';
import { LEGACY_RECEIPT_BLOCK_MESSAGE } from '../../shared/material-inventory/constants';
import {
  validateDiscreteBaseQuantity,
  validateLossReason,
  validateLotIssueable,
  validateMaterialIdentity,
  validatePositiveQuantity,
  validateSufficientMaterialBalance,
} from '../../shared/material-inventory/validation';
import type {
  CreateMatLotInput,
  MatLot,
  MatReconciliation,
  MatTransaction,
  MatUomConversion,
  MaterialBalance,
  PostMaterialTransactionInput,
  TransferMaterialInput,
} from '../types/material-inventory';
import type { SqlValue } from 'sql.js/dist/sql-wasm.js';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import { createOpeningBalanceCostLayer, snapshotMaterialConsumptionCost } from './costing-queries';
import { addLookupValue, nextBusinessCode } from './master-data-queries';

const now = () => new Date().toISOString();

function loadAllMaterialTransactions(): MaterialLedgerRow[] {
  return queryAll<MaterialLedgerRow>(
    `SELECT material_type, raw_material_id, packaging_material_id, material_lot_id,
            source_location_id, destination_location_id, base_quantity
     FROM mat_transactions`,
  );
}

export function seedMaterialLookupsIfEmpty(): void {
  for (const name of ['Breakage', 'Damage', 'Spoilage', 'Expiration', 'Sampling', 'Handling Loss', 'Contamination', 'Other']) {
    addLookupValue(MAT_LOOKUP_TYPES.LOSS_REASON, name);
  }
}

function nextMaterialGroupId(): string {
  return nextBusinessCode('materialOperationGroup', 'mat_transactions', 'transaction_group_id');
}

function getMaterialBaseUnit(
  materialType: MaterialType,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
): string {
  if (materialType === 'RAW_MATERIAL') {
    const row = queryOne<{ inventory_unit: string }>(
      'SELECT inventory_unit FROM md_raw_materials WHERE id = ?',
      [rawMaterialId],
    );
    if (!row) throw new Error('Raw material not found.');
    return row.inventory_unit;
  }
  const row = queryOne<{ inventory_unit: string }>(
    'SELECT inventory_unit FROM md_packaging_materials WHERE id = ?',
    [packagingMaterialId],
  );
  if (!row) throw new Error('Packaging material not found.');
  return row.inventory_unit;
}

export function getMaterialTrackingMode(
  materialType: MaterialType,
  materialId: number,
): 'LEGACY' | 'LEDGER' {
  if (materialType === 'RAW_MATERIAL') {
    return (queryOne<{ inventory_tracking_mode: string }>(
      'SELECT inventory_tracking_mode FROM md_raw_materials WHERE id = ?',
      [materialId],
    )?.inventory_tracking_mode ?? 'LEGACY') as 'LEGACY' | 'LEDGER';
  }
  return (queryOne<{ inventory_tracking_mode: string }>(
    'SELECT inventory_tracking_mode FROM md_packaging_materials WHERE id = ?',
    [materialId],
  )?.inventory_tracking_mode ?? 'LEGACY') as 'LEGACY' | 'LEDGER';
}

function countPostedLedgerTransactions(
  materialType: MaterialType,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
): number {
  if (materialType === 'RAW_MATERIAL') {
    return queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM mat_transactions
       WHERE material_type = 'RAW_MATERIAL' AND raw_material_id = ? AND reversal_of_transaction_id IS NULL`,
      [rawMaterialId],
    )?.count ?? 0;
  }
  return queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM mat_transactions
     WHERE material_type = 'PACKAGING_MATERIAL' AND packaging_material_id = ? AND reversal_of_transaction_id IS NULL`,
    [packagingMaterialId],
  )?.count ?? 0;
}

function assertLedgerMaterial(
  materialType: MaterialType,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
): void {
  validateMaterialIdentity({ materialType, rawMaterialId, packagingMaterialId });
  const materialId = (rawMaterialId ?? packagingMaterialId)!;
  const mode = getMaterialTrackingMode(materialType, materialId);
  if (mode !== 'LEDGER') {
    throw new Error(LEGACY_RECEIPT_BLOCK_MESSAGE);
  }
}

/** Explicit controlled activation — does not create inventory. */
export function activateMaterialLedgerTracking(
  materialType: MaterialType,
  materialId: number,
  activationReference?: string | null,
): void {
  const mode = getMaterialTrackingMode(materialType, materialId);
  if (mode === 'LEDGER') {
    throw new Error('Material already uses LEDGER tracking.');
  }
  const ts = now();
  if (materialType === 'RAW_MATERIAL') {
    runQuery(
      `UPDATE md_raw_materials SET inventory_tracking_mode = 'LEDGER', ledger_activated_at = ?, ledger_activation_reference = ? WHERE id = ?`,
      [ts, activationReference ?? null, materialId],
    );
  } else {
    runQuery(
      `UPDATE md_packaging_materials SET inventory_tracking_mode = 'LEDGER', ledger_activated_at = ?, ledger_activation_reference = ? WHERE id = ?`,
      [ts, activationReference ?? null, materialId],
    );
  }
}

export function getMaterialUomConversions(
  materialType: MaterialType,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
): MatUomConversion[] {
  return queryAll<MatUomConversion>(
    `SELECT * FROM mat_item_uom_conversions
     WHERE material_type = ? AND active = 1
       AND ((? IS NOT NULL AND raw_material_id = ?) OR (? IS NOT NULL AND packaging_material_id = ?))`,
    [materialType, rawMaterialId, rawMaterialId, packagingMaterialId, packagingMaterialId],
  );
}

export function normalizeMaterialQuantity(
  materialType: MaterialType,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
  quantity: number,
  unit: string,
): { baseQuantity: number; baseUnit: string } {
  const baseUnit = getMaterialBaseUnit(materialType, rawMaterialId, packagingMaterialId);
  const conversions = getMaterialUomConversions(materialType, rawMaterialId, packagingMaterialId);
  return normalizeToBaseUnit(quantity, unit, baseUnit, conversions);
}

export function saveMaterialUomConversion(input: Omit<MatUomConversion, 'id'>): number {
  validateMaterialIdentity({
    materialType: input.material_type,
    rawMaterialId: input.raw_material_id,
    packagingMaterialId: input.packaging_material_id,
  });
  validatePositiveQuantity(input.conversion_factor, 'Conversion factor');
  const ts = now();
  return insertRow(
    `INSERT INTO mat_item_uom_conversions (
      material_type, raw_material_id, packaging_material_id, from_unit, to_unit,
      conversion_factor, description, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.material_type,
      input.raw_material_id,
      input.packaging_material_id,
      input.from_unit,
      input.to_unit,
      input.conversion_factor,
      input.description ?? '',
      input.active ?? 1,
      ts,
      ts,
    ],
  );
}

export function createMaterialLot(input: CreateMatLotInput): number {
  validateMaterialIdentity({
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
  });
  const code = nextBusinessCode('materialLot', 'mat_lots', 'lot_code');
  const ts = now();
  return insertRow(
    `INSERT INTO mat_lots (
      lot_code, material_type, raw_material_id, packaging_material_id, supplier_id,
      supplier_lot_number, manufacturer_lot_number, received_date, manufacture_date,
      expiration_date, best_before_date, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.materialType,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
      input.supplierId ?? null,
      input.supplierLotNumber ?? null,
      input.manufacturerLotNumber ?? null,
      input.receivedDate ?? null,
      input.manufactureDate ?? null,
      input.expirationDate ?? null,
      input.bestBeforeDate ?? null,
      input.status ?? 'Active',
      input.notes ?? '',
      ts,
      ts,
    ],
  );
}

export function getMaterialLot(id: number): MatLot | null {
  return queryOne<MatLot>(
    `SELECT l.*,
      COALESCE(rm.name, pm.name) AS material_name
     FROM mat_lots l
     LEFT JOIN md_raw_materials rm ON rm.id = l.raw_material_id
     LEFT JOIN md_packaging_materials pm ON pm.id = l.packaging_material_id
     WHERE l.id = ?`,
    [id],
  );
}

export function listMaterialLots(filters?: {
  materialType?: MaterialType;
  rawMaterialId?: number;
  packagingMaterialId?: number;
}): MatLot[] {
  let sql = `SELECT l.*, COALESCE(rm.name, pm.name) AS material_name FROM mat_lots l
    LEFT JOIN md_raw_materials rm ON rm.id = l.raw_material_id
    LEFT JOIN md_packaging_materials pm ON pm.id = l.packaging_material_id WHERE 1=1`;
  const params: unknown[] = [];
  if (filters?.materialType) {
    sql += ' AND l.material_type = ?';
    params.push(filters.materialType);
  }
  if (filters?.rawMaterialId != null) {
    sql += ' AND l.raw_material_id = ?';
    params.push(filters.rawMaterialId);
  }
  if (filters?.packagingMaterialId != null) {
    sql += ' AND l.packaging_material_id = ?';
    params.push(filters.packagingMaterialId);
  }
  sql += ' ORDER BY l.received_date DESC, l.id DESC';
  return queryAll<MatLot>(sql, params as SqlValue[]);
}

function sortLotsFefoFifo(lots: MatLot[]): MatLot[] {
  return [...lots].sort((a, b) => {
    const expA = a.expiration_date ?? '9999-12-31';
    const expB = b.expiration_date ?? '9999-12-31';
    if (expA !== expB) return expA.localeCompare(expB);
    const recA = a.received_date ?? a.created_at;
    const recB = b.received_date ?? b.created_at;
    return recA.localeCompare(recB);
  });
}

export function getAvailableMaterialLots(
  materialType: MaterialType,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
  locationId?: number,
): MatLot[] {
  const lots = listMaterialLots({ materialType, rawMaterialId: rawMaterialId ?? undefined, packagingMaterialId: packagingMaterialId ?? undefined })
    .filter((l) => ['Active', 'Released'].includes(l.status));
  const txs = loadAllMaterialTransactions();
  const available = lots.filter((lot) => {
    const bal = locationId != null
      ? aggregateLotBalanceByLocation(lot.id, locationId, txs)
      : aggregateLotBalance(lot.id, txs);
    return bal > 1e-9;
  });
  return sortLotsFefoFifo(available);
}

export function getMaterialBalance(
  materialType: MaterialType,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
): MaterialBalance {
  const baseUnit = getMaterialBaseUnit(materialType, rawMaterialId, packagingMaterialId);
  const onHand = aggregateMaterialBalance(materialType, rawMaterialId, packagingMaterialId, loadAllMaterialTransactions());
  return { materialType, rawMaterialId, packagingMaterialId, baseUnit, onHand };
}

export function getMaterialBalanceByLocation(
  materialType: MaterialType,
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
  locationId: number,
): number {
  return aggregateMaterialBalanceByLocation(
    materialType,
    rawMaterialId,
    packagingMaterialId,
    locationId,
    loadAllMaterialTransactions(),
  );
}

export function getMaterialLotBalance(lotId: number): number {
  return aggregateLotBalance(lotId, loadAllMaterialTransactions());
}

export function getMaterialLotBalanceByLocation(lotId: number, locationId: number): number {
  return aggregateLotBalanceByLocation(lotId, locationId, loadAllMaterialTransactions());
}

function isTransactionReversed(txId: number): boolean {
  const count = queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM mat_transactions WHERE reversal_of_transaction_id = ?',
    [txId],
  )?.count ?? 0;
  return count > 0;
}

function validatePostWouldNotGoNegative(input: PostMaterialTransactionInput): void {
  const txs = loadAllMaterialTransactions();
  if (input.sourceLocationId != null && input.materialLotId != null) {
    const avail = aggregateLotBalanceByLocation(input.materialLotId, input.sourceLocationId, txs);
    validateSufficientMaterialBalance(avail, input.baseQuantity, `lot ${input.materialLotId} at location ${input.sourceLocationId}`);
  } else if (input.sourceLocationId != null) {
    const avail = aggregateMaterialBalanceByLocation(
      input.materialType,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
      input.sourceLocationId,
      txs,
    );
    validateSufficientMaterialBalance(avail, input.baseQuantity, `material at location ${input.sourceLocationId}`);
  }
}

function insertMaterialTransaction(input: PostMaterialTransactionInput): number {
  validateMaterialIdentity({
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
  });
  validatePositiveQuantity(input.baseQuantity, 'Base quantity');
  validateDiscreteBaseQuantity(input.baseQuantity, input.baseUnit);
  if (input.materialLotId != null && (input.transactionType === 'Production Issue' || input.transactionType === 'Location Transfer Out')) {
    const lot = getMaterialLot(input.materialLotId);
    if (lot) validateLotIssueable(lot.status, lot.expiration_date);
  }
  if (input.sourceLocationId != null) {
    validatePostWouldNotGoNegative(input);
  }
  const code = nextBusinessCode('materialTransaction', 'mat_transactions', 'transaction_code');
  return insertRow(
    `INSERT INTO mat_transactions (
      transaction_code, transaction_group_id, transaction_type, transaction_timestamp,
      material_type, raw_material_id, packaging_material_id, material_lot_id,
      source_location_id, source_bin_id, destination_location_id, destination_bin_id,
      quantity, unit, base_quantity, base_unit, reason_code,
      source_document_type, source_document_id, purchase_order_id, receipt_id,
      production_order_id, production_batch_id, unit_cost, cost_unit, currency, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      null,
      input.destinationLocationId ?? null,
      null,
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
  );
}

export function postMaterialTransaction(input: PostMaterialTransactionInput): number {
  assertLedgerMaterial(input.materialType, input.rawMaterialId ?? null, input.packagingMaterialId ?? null);
  return withDatabaseTransaction(() => insertMaterialTransaction(input));
}

export function reverseMaterialTransaction(transactionId: number, createdBy?: string | null): number[] {
  return withDatabaseTransaction(() => {
    const original = queryOne<MatTransaction>('SELECT * FROM mat_transactions WHERE id = ?', [transactionId]);
    if (!original) throw new Error('Transaction not found.');
    if (original.reversal_of_transaction_id) throw new Error('Cannot reverse a reversal transaction.');
    if (isTransactionReversed(transactionId)) throw new Error('Transaction has already been reversed.');

    const groupId = original.transaction_group_id;
    const toReverse = groupId
      ? queryAll<MatTransaction>(
          `SELECT * FROM mat_transactions WHERE transaction_group_id = ? AND reversal_of_transaction_id IS NULL`,
          [groupId],
        ).filter((tx) => !isTransactionReversed(tx.id))
      : [original];

    const reversalGroupId = groupId ? nextMaterialGroupId() : null;
    const reversalIds: number[] = [];

    for (const tx of toReverse) {
      const revInput: PostMaterialTransactionInput = {
        transactionType: 'Correction / Reversal',
        materialType: tx.material_type,
        rawMaterialId: tx.raw_material_id,
        packagingMaterialId: tx.packaging_material_id,
        materialLotId: tx.material_lot_id,
        sourceLocationId: tx.destination_location_id,
        destinationLocationId: tx.source_location_id,
        quantity: tx.quantity,
        unit: tx.unit,
        baseQuantity: tx.base_quantity,
        baseUnit: tx.base_unit,
        transactionGroupId: reversalGroupId ?? undefined,
        createdBy,
      };
      validatePostWouldNotGoNegative(revInput);
      const revId = insertRow(
        `INSERT INTO mat_transactions (
          transaction_code, transaction_group_id, transaction_type, transaction_timestamp,
          material_type, raw_material_id, packaging_material_id, material_lot_id,
          source_location_id, destination_location_id, quantity, unit, base_quantity, base_unit,
          reason_code, source_document_type, source_document_id, purchase_order_id, receipt_id,
          production_order_id, production_batch_id, unit_cost, cost_unit, currency, notes, created_by,
          created_at, reversal_of_transaction_id
        ) VALUES (?, ?, 'Correction / Reversal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Reversal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nextBusinessCode('materialTransaction', 'mat_transactions', 'transaction_code'),
          reversalGroupId,
          now(),
          tx.material_type,
          tx.raw_material_id,
          tx.packaging_material_id,
          tx.material_lot_id,
          tx.destination_location_id,
          tx.source_location_id,
          tx.quantity,
          tx.unit,
          tx.base_quantity,
          tx.base_unit,
          tx.source_document_type,
          tx.source_document_id,
          tx.purchase_order_id,
          tx.receipt_id,
          tx.production_order_id,
          tx.production_batch_id,
          tx.unit_cost,
          tx.cost_unit,
          tx.currency,
          `Reversal of ${tx.transaction_code}`,
          createdBy ?? null,
          now(),
          tx.id,
        ],
      );
      reversalIds.push(revId);
    }
    return reversalIds;
  });
}

export function transferMaterial(input: TransferMaterialInput): string {
  assertLedgerMaterial(input.materialType, input.rawMaterialId ?? null, input.packagingMaterialId ?? null);
  const lot = getMaterialLot(input.materialLotId);
  if (!lot) throw new Error('Material lot not found.');
  validateLotIssueable(lot.status);
  const { baseQuantity, baseUnit } = normalizeMaterialQuantity(
    input.materialType,
    input.rawMaterialId ?? null,
    input.packagingMaterialId ?? null,
    input.quantity,
    input.unit,
  );

  return withDatabaseTransaction(() => {
    const groupId = nextMaterialGroupId();
    insertMaterialTransaction({
      transactionType: 'Location Transfer Out',
      materialType: input.materialType,
      rawMaterialId: input.rawMaterialId,
      packagingMaterialId: input.packagingMaterialId,
      materialLotId: input.materialLotId,
      sourceLocationId: input.sourceLocationId,
      quantity: input.quantity,
      unit: input.unit,
      baseQuantity,
      baseUnit,
      transactionGroupId: groupId,
      notes: input.notes,
      createdBy: input.createdBy,
    });
    insertMaterialTransaction({
      transactionType: 'Location Transfer In',
      materialType: input.materialType,
      rawMaterialId: input.rawMaterialId,
      packagingMaterialId: input.packagingMaterialId,
      materialLotId: input.materialLotId,
      destinationLocationId: input.destinationLocationId,
      quantity: input.quantity,
      unit: input.unit,
      baseQuantity,
      baseUnit,
      transactionGroupId: groupId,
      notes: input.notes,
      createdBy: input.createdBy,
    });
    return groupId;
  });
}

export function postMaterialOpeningBalance(input: {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId: number;
  locationId: number;
  quantity: number;
  unit: string;
  effectiveDate?: string;
  notes?: string;
  createdBy?: string | null;
  unitCostKyd?: number | null;
  totalCostKyd?: number | null;
}): number {
  assertLedgerMaterial(input.materialType, input.rawMaterialId ?? null, input.packagingMaterialId ?? null);
  const existing = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM mat_transactions
     WHERE material_lot_id = ? AND destination_location_id = ? AND transaction_type = 'Opening Balance'
       AND reversal_of_transaction_id IS NULL
       AND id NOT IN (SELECT reversal_of_transaction_id FROM mat_transactions WHERE reversal_of_transaction_id IS NOT NULL)`,
    [input.materialLotId, input.locationId],
  )?.count ?? 0;
  if (existing > 0) {
    throw new Error('Opening Balance already exists for this material lot at this location.');
  }

  const { baseQuantity, baseUnit } = normalizeMaterialQuantity(
    input.materialType,
    input.rawMaterialId ?? null,
    input.packagingMaterialId ?? null,
    input.quantity,
    input.unit,
  );

  if (input.unitCostKyd != null && input.totalCostKyd != null) {
    const expected = input.unitCostKyd * baseQuantity;
    if (Math.abs(expected - input.totalCostKyd) > 0.01) {
      throw new Error(
        `Opening balance unit cost (${input.unitCostKyd}) × quantity (${baseQuantity}) ` +
          `does not match total cost (${input.totalCostKyd}).`,
      );
    }
  }

  const txId = postMaterialTransaction({
    transactionType: 'Opening Balance',
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
    materialLotId: input.materialLotId,
    destinationLocationId: input.locationId,
    quantity: input.quantity,
    unit: input.unit,
    baseQuantity,
    baseUnit,
    transactionTimestamp: input.effectiveDate ?? now(),
    notes: input.notes ?? 'Opening balance',
    createdBy: input.createdBy,
  });

  createOpeningBalanceCostLayer({
    materialLotId: input.materialLotId,
    effectiveDate: input.effectiveDate ?? now(),
    quantityBasis: baseQuantity,
    unitCostKyd: input.unitCostKyd,
    totalCostKyd: input.totalCostKyd,
    knownZeroCost: input.unitCostKyd === 0,
  });

  return txId;
}

export function postMaterialDamage(input: {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId: number;
  locationId: number;
  quantity: number;
  unit: string;
  lossType: string;
  reason: string;
  createdBy?: string | null;
}): number {
  validateLossReason(input.reason);
  const lot = getMaterialLot(input.materialLotId);
  if (!lot) throw new Error('Material lot not found.');
  const { baseQuantity, baseUnit } = normalizeMaterialQuantity(
    input.materialType,
    input.rawMaterialId ?? null,
    input.packagingMaterialId ?? null,
    input.quantity,
    input.unit,
  );
  return postMaterialTransaction({
    transactionType: input.lossType,
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
    materialLotId: input.materialLotId,
    sourceLocationId: input.locationId,
    quantity: input.quantity,
    unit: input.unit,
    baseQuantity,
    baseUnit,
    reasonCode: input.reason,
    notes: input.reason,
    createdBy: input.createdBy,
  });
}

export function postProductionIssue(input: {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId: number;
  sourceLocationId: number;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  productionOrderId: number;
  productionBatchId: number;
  transactionGroupId: string;
  createdBy?: string | null;
}): number {
  const lot = getMaterialLot(input.materialLotId);
  if (!lot) throw new Error('Material lot not found.');
  validateLotIssueable(lot.status, lot.expiration_date);
  const txId = insertMaterialTransaction({
    transactionType: 'Production Issue',
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
    materialLotId: input.materialLotId,
    sourceLocationId: input.sourceLocationId,
    quantity: input.quantity,
    unit: input.unit,
    baseQuantity: input.baseQuantity,
    baseUnit: input.baseUnit,
    sourceDocumentType: MAT_SOURCE_DOCUMENT_TYPES.PRODUCTION_BATCH,
    sourceDocumentId: input.productionBatchId,
    productionOrderId: input.productionOrderId,
    productionBatchId: input.productionBatchId,
    transactionGroupId: input.transactionGroupId,
    createdBy: input.createdBy,
  });
  snapshotMaterialConsumptionCost(
    txId,
    input.productionOrderId,
    input.productionBatchId,
    input.materialLotId,
    input.baseQuantity,
    false,
  );
  return txId;
}

function getNetIssuedBaseQuantityForBatchLot(batchId: number, lotId: number): number {
  const rows = queryAll<{ transaction_type: string; base_quantity: number }>(
    `SELECT transaction_type, base_quantity FROM mat_transactions
     WHERE production_batch_id = ? AND material_lot_id = ?
       AND transaction_type IN ('Production Issue', 'Production Return')
       AND reversal_of_transaction_id IS NULL
       AND id NOT IN (SELECT reversal_of_transaction_id FROM mat_transactions WHERE reversal_of_transaction_id IS NOT NULL)`,
    [batchId, lotId],
  );
  let issued = 0;
  let returned = 0;
  for (const row of rows) {
    if (row.transaction_type === 'Production Issue') issued += row.base_quantity;
    else returned += row.base_quantity;
  }
  return issued - returned;
}

export function postProductionReturn(input: {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId: number;
  destinationLocationId: number;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  productionOrderId: number;
  productionBatchId: number;
  transactionGroupId: string;
  createdBy?: string | null;
}): number {
  const netIssued = getNetIssuedBaseQuantityForBatchLot(input.productionBatchId, input.materialLotId);
  if (input.baseQuantity > netIssued + 1e-9) {
    throw new Error(
      `Production return ${input.baseQuantity} ${input.baseUnit} exceeds net issued ${netIssued} ${input.baseUnit} for batch/lot.`,
    );
  }
  const txId = insertMaterialTransaction({
    transactionType: 'Production Return',
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
    materialLotId: input.materialLotId,
    destinationLocationId: input.destinationLocationId,
    quantity: input.quantity,
    unit: input.unit,
    baseQuantity: input.baseQuantity,
    baseUnit: input.baseUnit,
    sourceDocumentType: MAT_SOURCE_DOCUMENT_TYPES.PRODUCTION_BATCH,
    sourceDocumentId: input.productionBatchId,
    productionOrderId: input.productionOrderId,
    productionBatchId: input.productionBatchId,
    transactionGroupId: input.transactionGroupId,
    createdBy: input.createdBy,
  });
  snapshotMaterialConsumptionCost(
    txId,
    input.productionOrderId,
    input.productionBatchId,
    input.materialLotId,
    input.baseQuantity,
    true,
  );
  return txId;
}

export function getMaterialTransactions(filters?: {
  materialType?: MaterialType;
  rawMaterialId?: number;
  packagingMaterialId?: number;
  lotId?: number;
  locationId?: number;
  productionBatchId?: number;
}): MatTransaction[] {
  let sql = `SELECT t.*, COALESCE(rm.name, pm.name) AS material_name, l.lot_code
    FROM mat_transactions t
    LEFT JOIN md_raw_materials rm ON rm.id = t.raw_material_id
    LEFT JOIN md_packaging_materials pm ON pm.id = t.packaging_material_id
    LEFT JOIN mat_lots l ON l.id = t.material_lot_id WHERE 1=1`;
  const params: unknown[] = [];
  if (filters?.materialType) { sql += ' AND t.material_type = ?'; params.push(filters.materialType); }
  if (filters?.rawMaterialId != null) { sql += ' AND t.raw_material_id = ?'; params.push(filters.rawMaterialId); }
  if (filters?.packagingMaterialId != null) { sql += ' AND t.packaging_material_id = ?'; params.push(filters.packagingMaterialId); }
  if (filters?.lotId != null) { sql += ' AND t.material_lot_id = ?'; params.push(filters.lotId); }
  if (filters?.productionBatchId != null) { sql += ' AND t.production_batch_id = ?'; params.push(filters.productionBatchId); }
  sql += ' ORDER BY t.transaction_timestamp DESC, t.id DESC';
  return queryAll<MatTransaction>(sql, params as SqlValue[]);
}

export function previewMaterialReconciliation(input: Omit<MatReconciliation, 'id' | 'status' | 'transaction_id' | 'posted_at'>): MatReconciliation {
  const systemQty = input.material_lot_id
    ? getMaterialLotBalanceByLocation(input.material_lot_id, input.location_id)
    : getMaterialBalanceByLocation(input.material_type, input.raw_material_id, input.packaging_material_id, input.location_id);
  return {
    id: 0,
    ...input,
    system_quantity: systemQty,
    variance_quantity: input.physical_quantity - systemQty,
    status: 'Draft',
    transaction_id: null,
    posted_at: null,
  };
}

export function createMaterialReconciliation(input: Omit<MatReconciliation, 'id' | 'status' | 'transaction_id' | 'posted_at' | 'system_quantity' | 'variance_quantity'>): number {
  const preview = previewMaterialReconciliation({
    material_type: input.material_type,
    raw_material_id: input.raw_material_id,
    packaging_material_id: input.packaging_material_id,
    material_lot_id: input.material_lot_id,
    location_id: input.location_id,
    system_quantity: 0,
    physical_quantity: input.physical_quantity,
    variance_quantity: 0,
    unit: input.unit,
    base_unit: input.base_unit,
    reason: input.reason,
    counted_by: input.counted_by,
    counted_at: input.counted_at,
    notes: input.notes,
  });
  return insertRow(
    `INSERT INTO mat_reconciliations (
      material_type, raw_material_id, packaging_material_id, material_lot_id, location_id,
      system_quantity, physical_quantity, variance_quantity, unit, base_unit, status, reason,
      counted_by, counted_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?)`,
    [
      preview.material_type,
      preview.raw_material_id,
      preview.packaging_material_id,
      preview.material_lot_id,
      preview.location_id,
      preview.system_quantity,
      preview.physical_quantity,
      preview.variance_quantity,
      preview.unit,
      preview.base_unit,
      preview.reason,
      preview.counted_by,
      preview.counted_at ?? now(),
      preview.notes,
    ],
  );
}

export function postMaterialReconciliation(reconciliationId: number, countedBy?: string | null): number {
  return withDatabaseTransaction(() => {
    const rec = queryOne<MatReconciliation>('SELECT * FROM mat_reconciliations WHERE id = ?', [reconciliationId]);
    if (!rec) throw new Error('Reconciliation not found.');
    if (rec.status === 'Posted') throw new Error('Reconciliation already posted.');
    if (Math.abs(rec.variance_quantity) < 1e-9) throw new Error('No variance to post.');

    const isIncrease = rec.variance_quantity > 0;
    const absBase = Math.abs(rec.variance_quantity);
    const txId = insertMaterialTransaction({
      transactionType: isIncrease ? 'Cycle Count Adjustment' : 'Cycle Count Adjustment',
      materialType: rec.material_type,
      rawMaterialId: rec.raw_material_id,
      packagingMaterialId: rec.packaging_material_id,
      materialLotId: rec.material_lot_id ?? undefined,
      sourceLocationId: isIncrease ? undefined : rec.location_id,
      destinationLocationId: isIncrease ? rec.location_id : undefined,
      quantity: absBase,
      unit: rec.base_unit,
      baseQuantity: absBase,
      baseUnit: rec.base_unit,
      reasonCode: rec.reason,
      sourceDocumentType: MAT_SOURCE_DOCUMENT_TYPES.RECONCILIATION,
      sourceDocumentId: reconciliationId,
      notes: rec.notes,
      createdBy: countedBy,
    });

    runQuery(
      `UPDATE mat_reconciliations SET status = 'Posted', transaction_id = ?, posted_at = ?, counted_by = COALESCE(?, counted_by) WHERE id = ?`,
      [txId, now(), countedBy ?? null, reconciliationId],
    );
    return txId;
  });
}

export function getLotProductionUsage(lotId: number): MatTransaction[] {
  return getMaterialTransactions({ lotId }).filter((t) => t.transaction_type === 'Production Issue');
}

export function getBatchMaterialTransactions(batchId: number): MatTransaction[] {
  return getMaterialTransactions({ productionBatchId: batchId });
}

export interface MaterialLedgerInfo {
  trackingMode: 'LEGACY' | 'LEDGER';
  ledgerActivatedAt: string | null;
  ledgerActivationReference: string | null;
  onHand: number;
  baseUnit: string;
  hasLedgerTransactions: boolean;
}

export function getMaterialLedgerInfo(
  materialType: MaterialType,
  materialId: number,
): MaterialLedgerInfo {
  const trackingMode = getMaterialTrackingMode(materialType, materialId);
  const rawId = materialType === 'RAW_MATERIAL' ? materialId : null;
  const pkgId = materialType === 'PACKAGING_MATERIAL' ? materialId : null;
  let ledgerActivatedAt: string | null = null;
  let ledgerActivationReference: string | null = null;
  if (materialType === 'RAW_MATERIAL') {
    const row = queryOne<{ ledger_activated_at: string | null; ledger_activation_reference: string | null }>(
      'SELECT ledger_activated_at, ledger_activation_reference FROM md_raw_materials WHERE id = ?',
      [materialId],
    );
    ledgerActivatedAt = row?.ledger_activated_at ?? null;
    ledgerActivationReference = row?.ledger_activation_reference ?? null;
  } else {
    const row = queryOne<{ ledger_activated_at: string | null; ledger_activation_reference: string | null }>(
      'SELECT ledger_activated_at, ledger_activation_reference FROM md_packaging_materials WHERE id = ?',
      [materialId],
    );
    ledgerActivatedAt = row?.ledger_activated_at ?? null;
    ledgerActivationReference = row?.ledger_activation_reference ?? null;
  }
  const balance = getMaterialBalance(materialType, rawId, pkgId);
  return {
    trackingMode,
    ledgerActivatedAt,
    ledgerActivationReference,
    onHand: balance.onHand,
    baseUnit: balance.baseUnit,
    hasLedgerTransactions: countPostedLedgerTransactions(materialType, rawId, pkgId) > 0,
  };
}

export function setMaterialTrackingMode(
  materialType: MaterialType,
  materialId: number,
  mode: 'LEGACY' | 'LEDGER',
): void {
  if (mode !== 'LEGACY' && mode !== 'LEDGER') throw new Error('Invalid tracking mode.');
  const current = getMaterialTrackingMode(materialType, materialId);
  if (mode === 'LEGACY' && current === 'LEDGER') {
    const rawId = materialType === 'RAW_MATERIAL' ? materialId : null;
    const pkgId = materialType === 'PACKAGING_MATERIAL' ? materialId : null;
    const txCount = countPostedLedgerTransactions(materialType, rawId, pkgId);
    if (txCount > 0) {
      throw new Error('Cannot downgrade to LEGACY: posted ledger transactions exist for this material.');
    }
  }
  if (mode === 'LEDGER' && current === 'LEGACY') {
    activateMaterialLedgerTracking(materialType, materialId, 'setMaterialTrackingMode');
    return;
  }
  if (materialType === 'RAW_MATERIAL') {
    runQuery('UPDATE md_raw_materials SET inventory_tracking_mode = ? WHERE id = ?', [mode, materialId]);
  } else {
    runQuery('UPDATE md_packaging_materials SET inventory_tracking_mode = ? WHERE id = ?', [mode, materialId]);
  }
}
