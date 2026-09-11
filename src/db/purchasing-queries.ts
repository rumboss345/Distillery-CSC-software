import { derivePurchaseOrderStatusFromReceipts, assertPurchaseOrderStatusTransition, isPurchaseOrderEditable } from '../../shared/purchasing/status-transitions';
import { type MaterialType } from '../../shared/material-inventory/constants';
import { formatLegacyReceiptBlockMessage } from '../../shared/material-inventory/receipt-post-errors';
import { validateMaterialIdentity, validateNonNegativeQuantity, validatePositiveQuantity } from '../../shared/material-inventory/validation';
import type {
  AddPurchaseOrderLineInput,
  AddReceiptLineInput,
  CreatePurchaseOrderInput,
  CreateReceiptInput,
  PurPurchaseOrder,
  PurPurchaseOrderLine,
  PurReceipt,
  PurReceiptLine,
} from '../types/purchasing';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import { nextBusinessCode } from './master-data-queries';
import {
  createMaterialLot,
  getMaterialTrackingMode,
  normalizeMaterialQuantity,
  postMaterialTransaction,
  reverseMaterialTransaction,
} from './material-inventory-queries';

const now = () => new Date().toISOString();

export function createPurchaseOrder(input: CreatePurchaseOrderInput): number {
  if (!input.supplierId) throw new Error('Supplier is required.');
  const code = nextBusinessCode('purchaseOrder', 'pur_purchase_orders', 'po_code');
  const ts = now();
  return insertRow(
    `INSERT INTO pur_purchase_orders (
      po_code, supplier_id, order_date, expected_date, status, currency,
      supplier_reference, ship_to_location_id, payment_terms, shipping_terms,
      notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.supplierId,
      input.orderDate,
      input.expectedDate ?? null,
      input.currency ?? 'USD',
      input.supplierReference ?? null,
      input.shipToLocationId ?? null,
      input.paymentTerms ?? null,
      input.shippingTerms ?? null,
      input.notes ?? '',
      input.createdBy ?? null,
      ts,
      ts,
    ],
  );
}

export function updateDraftPurchaseOrder(id: number, input: Partial<CreatePurchaseOrderInput>): void {
  const po = getPurchaseOrder(id);
  if (!po) throw new Error('Purchase order not found.');
  if (!isPurchaseOrderEditable(po.status)) throw new Error('Only Draft purchase orders can be edited.');
  runQuery(
    `UPDATE pur_purchase_orders SET
      supplier_id = COALESCE(?, supplier_id),
      order_date = COALESCE(?, order_date),
      expected_date = COALESCE(?, expected_date),
      currency = COALESCE(?, currency),
      supplier_reference = COALESCE(?, supplier_reference),
      ship_to_location_id = COALESCE(?, ship_to_location_id),
      payment_terms = COALESCE(?, payment_terms),
      shipping_terms = COALESCE(?, shipping_terms),
      notes = COALESCE(?, notes),
      updated_at = ?
     WHERE id = ?`,
    [
      input.supplierId ?? null,
      input.orderDate ?? null,
      input.expectedDate ?? null,
      input.currency ?? null,
      input.supplierReference ?? null,
      input.shipToLocationId ?? null,
      input.paymentTerms ?? null,
      input.shippingTerms ?? null,
      input.notes ?? null,
      now(),
      id,
    ],
  );
}

export function addPurchaseOrderLine(input: AddPurchaseOrderLineInput): number {
  const po = getPurchaseOrder(input.purchaseOrderId);
  if (!po) throw new Error('Purchase order not found.');
  if (!isPurchaseOrderEditable(po.status)) throw new Error('Lines can only be added to Draft purchase orders.');
  validateMaterialIdentity({
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
  });
  validatePositiveQuantity(input.orderedQuantity, 'Ordered quantity');
  const lineNum = (queryOne<{ max_n: number }>(
    'SELECT COALESCE(MAX(line_number), 0) AS max_n FROM pur_purchase_order_lines WHERE purchase_order_id = ?',
    [input.purchaseOrderId],
  )?.max_n ?? 0) + 1;

  let description = input.description ?? '';
  if (!description) {
    if (input.materialType === 'RAW_MATERIAL') {
      description = queryOne<{ name: string }>('SELECT name FROM md_raw_materials WHERE id = ?', [input.rawMaterialId ?? null])?.name ?? '';
    } else {
      description = queryOne<{ name: string }>('SELECT name FROM md_packaging_materials WHERE id = ?', [input.packagingMaterialId ?? null])?.name ?? '';
    }
  }

  return insertRow(
    `INSERT INTO pur_purchase_order_lines (
      purchase_order_id, line_number, material_type, raw_material_id, packaging_material_id,
      description, ordered_quantity, unit, unit_price, currency, expected_date, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.purchaseOrderId,
      lineNum,
      input.materialType,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
      description,
      input.orderedQuantity,
      input.unit,
      input.unitPrice,
      input.currency ?? po.currency,
      input.expectedDate ?? null,
      input.notes ?? '',
    ],
  );
}

export function getPurchaseOrderSubtotal(purchaseOrderId: number): number {
  const lines = queryAll<{ ordered_quantity: number; unit_price: number }>(
    'SELECT ordered_quantity, unit_price FROM pur_purchase_order_lines WHERE purchase_order_id = ?',
    [purchaseOrderId],
  );
  return lines.reduce((s, l) => s + l.ordered_quantity * l.unit_price, 0);
}

export function submitPurchaseOrder(id: number, _userId?: string | null): void {
  const po = getPurchaseOrder(id);
  if (!po) throw new Error('Purchase order not found.');
  assertPurchaseOrderStatusTransition(po.status, 'Submitted');
  const lineCount = queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM pur_purchase_order_lines WHERE purchase_order_id = ?',
    [id],
  )?.count ?? 0;
  if (lineCount === 0) throw new Error('Purchase order must have at least one line.');
  runQuery(
    `UPDATE pur_purchase_orders SET status = 'Submitted', submitted_at = ?, updated_at = ? WHERE id = ?`,
    [now(), now(), id],
  );
}

export function cancelPurchaseOrder(id: number, _userId?: string | null): void {
  const po = getPurchaseOrder(id);
  if (!po) throw new Error('Purchase order not found.');
  assertPurchaseOrderStatusTransition(po.status, 'Cancelled');
  runQuery(
    `UPDATE pur_purchase_orders SET status = 'Cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?`,
    [now(), now(), id],
  );
}

export function closePurchaseOrder(id: number, _userId?: string | null): void {
  const po = getPurchaseOrder(id);
  if (!po) throw new Error('Purchase order not found.');
  assertPurchaseOrderStatusTransition(po.status, 'Closed');
  runQuery(
    `UPDATE pur_purchase_orders SET status = 'Closed', closed_at = ?, updated_at = ? WHERE id = ?`,
    [now(), now(), id],
  );
}

export function getPurchaseOrder(id: number): PurPurchaseOrder | null {
  return queryOne<PurPurchaseOrder>(
    `SELECT po.*, s.company_name AS supplier_name FROM pur_purchase_orders po
     LEFT JOIN md_suppliers s ON s.id = po.supplier_id WHERE po.id = ?`,
    [id],
  );
}

export function listPurchaseOrders(): PurPurchaseOrder[] {
  return queryAll<PurPurchaseOrder>(
    `SELECT po.*, s.company_name AS supplier_name FROM pur_purchase_orders po
     LEFT JOIN md_suppliers s ON s.id = po.supplier_id ORDER BY po.order_date DESC, po.id DESC`,
  );
}

export function getPurchaseOrderLines(purchaseOrderId: number): PurPurchaseOrderLine[] {
  return queryAll<PurPurchaseOrderLine>(
    `SELECT l.*, COALESCE(rm.name, pm.name) AS material_name
     FROM pur_purchase_order_lines l
     LEFT JOIN md_raw_materials rm ON rm.id = l.raw_material_id
     LEFT JOIN md_packaging_materials pm ON pm.id = l.packaging_material_id
     WHERE l.purchase_order_id = ? ORDER BY l.line_number`,
    [purchaseOrderId],
  ).map((line) => ({
    ...line,
    received_quantity: getReceivedQuantity(line.id),
    remaining_quantity: getRemainingQuantity(line.id),
  }));
}

/** Received quantity derived from posted receipt lines only. */
export function getReceivedQuantity(purchaseOrderLineId: number): number {
  return queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(rl.accepted_quantity), 0) AS total
     FROM pur_receipt_lines rl
     JOIN pur_receipts r ON r.id = rl.receipt_id
     WHERE rl.purchase_order_line_id = ? AND r.status = 'Posted'`,
    [purchaseOrderLineId],
  )?.total ?? 0;
}

export function getRemainingQuantity(purchaseOrderLineId: number): number {
  const line = queryOne<{ ordered_quantity: number }>(
    'SELECT ordered_quantity FROM pur_purchase_order_lines WHERE id = ?',
    [purchaseOrderLineId],
  );
  if (!line) return 0;
  return Math.max(0, line.ordered_quantity - getReceivedQuantity(purchaseOrderLineId));
}

function updatePurchaseOrderReceiptStatus(purchaseOrderId: number): void {
  const po = getPurchaseOrder(purchaseOrderId);
  if (!po || po.status === 'Cancelled' || po.status === 'Closed' || po.status === 'Draft') return;
  const lines = queryAll<{ ordered_quantity: number; id: number }>(
    'SELECT id, ordered_quantity FROM pur_purchase_order_lines WHERE purchase_order_id = ?',
    [purchaseOrderId],
  );
  const orderedTotal = lines.reduce((s, l) => s + l.ordered_quantity, 0);
  const receivedTotal = lines.reduce((s, l) => s + getReceivedQuantity(l.id), 0);
  const newStatus = derivePurchaseOrderStatusFromReceipts(orderedTotal, receivedTotal, po.status);
  if (newStatus !== po.status) {
    runQuery('UPDATE pur_purchase_orders SET status = ?, updated_at = ? WHERE id = ?', [newStatus, now(), purchaseOrderId]);
  }
}

export function createReceipt(input: CreateReceiptInput): number {
  const code = nextBusinessCode('receipt', 'pur_receipts', 'receipt_code');
  return insertRow(
    `INSERT INTO pur_receipts (
      receipt_code, purchase_order_id, supplier_id, received_date, receiving_location_id,
      packing_slip_number, supplier_invoice_number, container_number, bill_of_lading,
      customs_reference, import_type, origin_country, status, notes, received_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)`,
    [
      code,
      input.purchaseOrderId ?? null,
      input.supplierId,
      input.receivedDate,
      input.receivingLocationId,
      input.packingSlipNumber ?? null,
      input.supplierInvoiceNumber ?? null,
      input.containerNumber ?? null,
      input.billOfLading ?? null,
      input.customsReference ?? null,
      input.importType ?? null,
      input.originCountry ?? null,
      input.notes ?? '',
      input.receivedBy ?? null,
      now(),
    ],
  );
}

export function addReceiptLine(input: AddReceiptLineInput): number {
  const receipt = getReceipt(input.receiptId);
  if (!receipt) throw new Error('Receipt not found.');
  if (receipt.status !== 'Draft') throw new Error('Lines can only be added to Draft receipts.');
  validateMaterialIdentity({
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
  });
  validatePositiveQuantity(input.acceptedQuantity, 'Accepted quantity');
  const rejected = input.rejectedQuantity ?? 0;
  validateNonNegativeQuantity(rejected);

  if (input.purchaseOrderLineId) {
    const remaining = getRemainingQuantity(input.purchaseOrderLineId);
    if (input.acceptedQuantity > remaining + 1e-9) {
      throw new Error(
        `Over-receipt blocked: accepted ${input.acceptedQuantity} exceeds remaining ${remaining} on PO line.`,
      );
    }
  }

  const { baseQuantity, baseUnit } = normalizeMaterialQuantity(
    input.materialType,
    input.rawMaterialId ?? null,
    input.packagingMaterialId ?? null,
    input.acceptedQuantity,
    input.unit,
  );

  let lotId: number | null = null;
  if (input.createLot !== false) {
    lotId = createMaterialLot({
      materialType: input.materialType,
      rawMaterialId: input.rawMaterialId,
      packagingMaterialId: input.packagingMaterialId,
      supplierId: receipt.supplier_id,
      supplierLotNumber: input.supplierLotNumber,
      receivedDate: receipt.received_date,
      expirationDate: input.expirationDate,
      status: rejected > 0 && input.acceptedQuantity <= 0 ? 'Rejected' : 'Active',
    });
  }

  return insertRow(
    `INSERT INTO pur_receipt_lines (
      receipt_id, purchase_order_line_id, material_type, raw_material_id, packaging_material_id,
      received_quantity, unit, accepted_quantity, rejected_quantity, base_quantity, base_unit,
      material_lot_id, unit_cost, currency, notes, supplier_lot_number, expiration_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.receiptId,
      input.purchaseOrderLineId ?? null,
      input.materialType,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
      input.receivedQuantity,
      input.unit,
      input.acceptedQuantity,
      rejected,
      baseQuantity,
      baseUnit,
      lotId,
      input.unitCost ?? null,
      input.currency ?? null,
      input.notes ?? '',
      input.supplierLotNumber ?? null,
      input.expirationDate ?? null,
    ],
  );
}

export function getReceipt(id: number): PurReceipt | null {
  return queryOne<PurReceipt>(
    `SELECT r.*, s.company_name AS supplier_name FROM pur_receipts r
     LEFT JOIN md_suppliers s ON s.id = r.supplier_id WHERE r.id = ?`,
    [id],
  );
}

export function listReceipts(purchaseOrderId?: number): PurReceipt[] {
  if (purchaseOrderId != null) {
    return queryAll<PurReceipt>(
      `SELECT r.*, s.company_name AS supplier_name FROM pur_receipts r
       LEFT JOIN md_suppliers s ON s.id = r.supplier_id
       WHERE r.purchase_order_id = ? ORDER BY r.received_date DESC`,
      [purchaseOrderId],
    );
  }
  return queryAll<PurReceipt>(
    `SELECT r.*, s.company_name AS supplier_name FROM pur_receipts r
     LEFT JOIN md_suppliers s ON s.id = r.supplier_id ORDER BY r.received_date DESC`,
  );
}

export function getReceiptLines(receiptId: number): PurReceiptLine[] {
  return queryAll<PurReceiptLine>(
    `SELECT rl.*, COALESCE(rm.name, pm.name) AS material_name, l.lot_code
     FROM pur_receipt_lines rl
     LEFT JOIN md_raw_materials rm ON rm.id = rl.raw_material_id
     LEFT JOIN md_packaging_materials pm ON pm.id = rl.packaging_material_id
     LEFT JOIN mat_lots l ON l.id = rl.material_lot_id
     WHERE rl.receipt_id = ?`,
    [receiptId],
  );
}

function nextMaterialGroupIdForReceipt(): string {
  return nextBusinessCode('materialOperationGroup', 'mat_transactions', 'transaction_group_id');
}

export function getLegacyMaterialsOnReceipt(receiptId: number): Array<{ materialName: string; materialType: MaterialType }> {
  const lines = getReceiptLines(receiptId);
  const seen = new Set<string>();
  const result: Array<{ materialName: string; materialType: MaterialType }> = [];
  for (const line of lines) {
    if (line.accepted_quantity <= 0) continue;
    const materialId = (line.raw_material_id ?? line.packaging_material_id)!;
    const key = `${line.material_type}:${materialId}`;
    if (seen.has(key)) continue;
    if (getMaterialTrackingMode(line.material_type, materialId) !== 'LEDGER') {
      seen.add(key);
      result.push({
        materialName: line.material_name ?? `Material #${materialId}`,
        materialType: line.material_type,
      });
    }
  }
  return result;
}

function validateReceiptLinesBeforePost(_receipt: PurReceipt, lines: PurReceiptLine[]): void {
  let hasPostableLine = false;
  const legacyMaterials: Array<{ materialName: string; materialType: MaterialType }> = [];
  const legacySeen = new Set<string>();
  for (const line of lines) {
    if (line.accepted_quantity <= 0) continue;
    hasPostableLine = true;
    if (!line.material_lot_id) throw new Error('Receipt line missing material lot.');
    const materialId = (line.raw_material_id ?? line.packaging_material_id)!;
    if (getMaterialTrackingMode(line.material_type, materialId) !== 'LEDGER') {
      const key = `${line.material_type}:${materialId}`;
      if (!legacySeen.has(key)) {
        legacySeen.add(key);
        legacyMaterials.push({
          materialName: line.material_name ?? `Material #${materialId}`,
          materialType: line.material_type,
        });
      }
    }
    if (line.purchase_order_line_id) {
      const remaining = getRemainingQuantity(line.purchase_order_line_id);
      if (line.accepted_quantity > remaining + 1e-9) {
        throw new Error(
          `Over-receipt blocked: accepted ${line.accepted_quantity} exceeds remaining ${remaining} on PO line.`,
        );
      }
    }
    normalizeMaterialQuantity(
      line.material_type,
      line.raw_material_id,
      line.packaging_material_id,
      line.accepted_quantity,
      line.unit,
    );
  }
  if (legacyMaterials.length > 0) {
    throw new Error(formatLegacyReceiptBlockMessage(legacyMaterials));
  }
  if (!hasPostableLine) throw new Error('Receipt must have at least one line with accepted quantity.');
}

export function postReceipt(receiptId: number, receivedBy?: string | null): string {
  return withDatabaseTransaction(() => {
    const receipt = getReceipt(receiptId);
    if (!receipt) throw new Error('Receipt not found.');
    if (receipt.status === 'Posted') throw new Error('Receipt already posted.');
    if (receipt.status !== 'Draft') throw new Error(`Receipt cannot be posted from status ${receipt.status}.`);
    const lines = getReceiptLines(receiptId);
    if (lines.length === 0) throw new Error('Receipt must have at least one line.');
    validateReceiptLinesBeforePost(receipt, lines);

    const groupId = nextMaterialGroupIdForReceipt();

    for (const line of lines) {
      if (line.accepted_quantity <= 0) continue;

      postMaterialTransaction({
        transactionType: 'Purchase Receipt',
        materialType: line.material_type,
        rawMaterialId: line.raw_material_id,
        packagingMaterialId: line.packaging_material_id,
        materialLotId: line.material_lot_id!,
        destinationLocationId: receipt.receiving_location_id,
        quantity: line.accepted_quantity,
        unit: line.unit,
        baseQuantity: line.base_quantity,
        baseUnit: line.base_unit,
        purchaseOrderId: receipt.purchase_order_id ?? undefined,
        receiptId: receipt.id,
        unitCost: line.unit_cost,
        costUnit: line.unit,
        currency: line.currency,
        transactionGroupId: groupId,
        transactionTimestamp: receipt.received_date,
        createdBy: receivedBy,
      });
    }

    runQuery(
      `UPDATE pur_receipts SET status = 'Posted', posted_at = ?, transaction_group_id = ?, received_by = COALESCE(?, received_by) WHERE id = ?`,
      [now(), groupId, receivedBy ?? null, receiptId],
    );

    if (receipt.purchase_order_id) {
      updatePurchaseOrderReceiptStatus(receipt.purchase_order_id);
    }

    return groupId;
  });
}

export function reverseReceipt(receiptId: number, createdBy?: string | null): number[] {
  return withDatabaseTransaction(() => {
    const receipt = getReceipt(receiptId);
    if (!receipt) throw new Error('Receipt not found.');
    if (receipt.status !== 'Posted') throw new Error('Only Posted receipts can be reversed.');
    if (!receipt.transaction_group_id) throw new Error('Receipt has no transaction group.');

    const txs = queryAll<{ id: number }>(
      'SELECT id FROM mat_transactions WHERE transaction_group_id = ? AND receipt_id = ?',
      [receipt.transaction_group_id, receiptId],
    );
    const reversalIds: number[] = [];
    for (const tx of txs) {
      reversalIds.push(...reverseMaterialTransaction(tx.id, createdBy));
    }

    runQuery(
      `UPDATE pur_receipts SET status = 'Reversed', reversed_at = ? WHERE id = ?`,
      [now(), receiptId],
    );

    if (receipt.purchase_order_id) {
      updatePurchaseOrderReceiptStatus(receipt.purchase_order_id);
    }

    return reversalIds;
  });
}

export function postDirectReceipt(input: {
  supplierId: number;
  receivedDate: string;
  receivingLocationId: number;
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  acceptedQuantity: number;
  unit: string;
  unitCost?: number | null;
  currency?: string;
  supplierLotNumber?: string | null;
  expirationDate?: string | null;
  notes?: string;
  receivedBy?: string | null;
}): number {
  const receiptId = createReceipt({
    purchaseOrderId: null,
    supplierId: input.supplierId,
    receivedDate: input.receivedDate,
    receivingLocationId: input.receivingLocationId,
    notes: input.notes ?? 'Direct receipt without PO',
    receivedBy: input.receivedBy,
  });
  addReceiptLine({
    receiptId,
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
    receivedQuantity: input.acceptedQuantity,
    acceptedQuantity: input.acceptedQuantity,
    unit: input.unit,
    unitCost: input.unitCost,
    currency: input.currency,
    supplierLotNumber: input.supplierLotNumber,
    expirationDate: input.expirationDate,
  });
  postReceipt(receiptId, input.receivedBy);
  return receiptId;
}

export function postSupplierReturn(input: {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId: number;
  sourceLocationId: number;
  quantity: number;
  unit: string;
  reason: string;
  purchaseOrderId?: number | null;
  receiptId?: number | null;
  createdBy?: string | null;
}): number {
  const { baseQuantity, baseUnit } = normalizeMaterialQuantity(
    input.materialType,
    input.rawMaterialId ?? null,
    input.packagingMaterialId ?? null,
    input.quantity,
    input.unit,
  );
  return postMaterialTransaction({
    transactionType: 'Supplier Return',
    materialType: input.materialType,
    rawMaterialId: input.rawMaterialId,
    packagingMaterialId: input.packagingMaterialId,
    materialLotId: input.materialLotId,
    sourceLocationId: input.sourceLocationId,
    quantity: input.quantity,
    unit: input.unit,
    baseQuantity,
    baseUnit,
    reasonCode: input.reason,
    purchaseOrderId: input.purchaseOrderId ?? undefined,
    receiptId: input.receiptId ?? undefined,
    notes: input.reason,
    createdBy: input.createdBy,
  });
}
