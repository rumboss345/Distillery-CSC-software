import { previewLandedCostAllocation, type ReceiptLineAllocationBasis } from '../../shared/costing/landed-cost';
import { BASE_COSTING_CURRENCY } from '../../shared/costing/constants';
import { convertToKyd } from '../../shared/costing/fx';
import { assertAllocationTotal } from '../../shared/costing/money';
import { assertFinalizedImmutable } from '../../shared/costing/validation';
import type { AllocationMethod } from '../../shared/costing/constants';
import type {
  CostLandedCostComponent,
  CostLandedCostDocument,
} from '../types/costing';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import {
  addLandedCostToMaterialLot,
  createCostAdjustment,
  flagPostConsumptionAdjustment,
  getMaterialLotValuation,
} from './costing-queries';
import { nextBusinessCode } from './master-data-queries';
import { getReceipt, getReceiptLines } from './purchasing-queries';

const now = () => new Date().toISOString();

export function createLandedCostDocument(input: {
  supplierId?: number | null;
  purchaseOrderId?: number | null;
  receiptId?: number | null;
  shipmentReference?: string | null;
  containerNumber?: string | null;
  billOfLading?: string | null;
  currency?: string;
  exchangeRateToKyd?: number;
  effectiveDate: string;
  notes?: string;
  createdBy?: string | null;
}): number {
  const code = nextBusinessCode('landedCost', 'cost_landed_cost_documents', 'landed_cost_code');
  const cur = (input.currency ?? BASE_COSTING_CURRENCY).toUpperCase();
  const rate = cur === BASE_COSTING_CURRENCY ? 1 : (input.exchangeRateToKyd ?? 1);
  return insertRow(
    `INSERT INTO cost_landed_cost_documents (
      landed_cost_code, status, supplier_id, purchase_order_id, receipt_id,
      shipment_reference, container_number, bill_of_lading, currency,
      exchange_rate_to_kyd, effective_date, notes, created_by, created_at, updated_at
    ) VALUES (?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.supplierId ?? null,
      input.purchaseOrderId ?? null,
      input.receiptId ?? null,
      input.shipmentReference ?? null,
      input.containerNumber ?? null,
      input.billOfLading ?? null,
      cur,
      rate,
      input.effectiveDate,
      input.notes ?? '',
      input.createdBy ?? null,
      now(),
      now(),
    ],
  );
}

export function getLandedCostDocument(id: number): CostLandedCostDocument | null {
  return queryOne<CostLandedCostDocument>('SELECT * FROM cost_landed_cost_documents WHERE id = ?', [id]);
}

export function listLandedCostDocuments(filters?: { status?: string; receiptId?: number }): CostLandedCostDocument[] {
  let sql = 'SELECT * FROM cost_landed_cost_documents WHERE 1=1';
  const params: (string | number)[] = [];
  if (filters?.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.receiptId) {
    sql += ' AND receipt_id = ?';
    params.push(filters.receiptId);
  }
  sql += ' ORDER BY created_at DESC';
  return queryAll<CostLandedCostDocument>(sql, params);
}

export function addLandedCostComponent(input: {
  landedCostDocumentId: number;
  componentType: string;
  description?: string;
  originalAmount: number;
  currency?: string;
  exchangeRateToKyd?: number;
  allocationMethod?: AllocationMethod;
  notes?: string;
}): number {
  const doc = getLandedCostDocument(input.landedCostDocumentId);
  if (!doc) throw new Error('Landed cost document not found.');
  assertFinalizedImmutable(doc.status, 'add component');

  const cur = (input.currency ?? doc.currency).toUpperCase();
  const rate = cur === BASE_COSTING_CURRENCY ? 1 : (input.exchangeRateToKyd ?? doc.exchange_rate_to_kyd);
  const kyd = convertToKyd(input.originalAmount, rate);

  return insertRow(
    `INSERT INTO cost_landed_cost_components (
      landed_cost_document_id, component_type, description, original_amount, currency,
      exchange_rate_to_kyd, kyd_amount, allocation_method, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.landedCostDocumentId,
      input.componentType,
      input.description ?? '',
      input.originalAmount,
      cur,
      rate,
      kyd,
      input.allocationMethod ?? 'BY_PURCHASE_VALUE',
      input.notes ?? '',
    ],
  );
}

export function getLandedCostComponents(documentId: number): CostLandedCostComponent[] {
  return queryAll<CostLandedCostComponent>(
    'SELECT * FROM cost_landed_cost_components WHERE landed_cost_document_id = ? ORDER BY id',
    [documentId],
  );
}

function buildReceiptLineBasis(receiptId: number): ReceiptLineAllocationBasis[] {
  const lines = getReceiptLines(receiptId);
  const receipt = getReceipt(receiptId);
  const rate = receipt?.exchange_rate ?? 1;

  return lines
    .filter((l) => l.accepted_quantity > 0 && l.material_lot_id)
    .map((line) => {
      const unitCost = line.unit_cost ?? 0;
      const cur = (line.currency ?? BASE_COSTING_CURRENCY).toUpperCase();
      const fxRate = cur === BASE_COSTING_CURRENCY ? 1 : rate;
      const purchaseOriginal = unitCost * line.accepted_quantity;
      const purchaseKyd = cur === BASE_COSTING_CURRENCY ? purchaseOriginal : convertToKyd(purchaseOriginal, fxRate);

      return {
        receiptLineId: line.id,
        receiptId,
        materialLotId: line.material_lot_id,
        purchaseValueKyd: purchaseKyd,
        quantity: line.base_quantity,
        baseUnit: line.base_unit,
        weightKg: line.base_unit === 'kg' ? line.base_quantity : null,
        volumeLitres: ['l', 'L'].includes(line.base_unit) ? line.base_quantity : null,
      };
    });
}

export function previewAllocation(
  documentId: number,
  componentId: number,
  manualAllocations?: { receiptLineId: number; allocatedKydAmount: number }[],
) {
  const doc = getLandedCostDocument(documentId);
  if (!doc) throw new Error('Document not found.');
  if (!doc.receipt_id) throw new Error('Receipt is required for allocation preview.');

  const component = queryOne<CostLandedCostComponent>(
    'SELECT * FROM cost_landed_cost_components WHERE id = ? AND landed_cost_document_id = ?',
    [componentId, documentId],
  );
  if (!component) throw new Error('Component not found.');

  const receiptLines = buildReceiptLineBasis(doc.receipt_id);
  return previewLandedCostAllocation(
    component.allocation_method as AllocationMethod,
    component.kyd_amount,
    receiptLines,
    manualAllocations,
  );
}

export function finalizeLandedCost(documentId: number, createdBy?: string | null): void {
  withDatabaseTransaction(() => {
    const doc = getLandedCostDocument(documentId);
    if (!doc) throw new Error('Document not found.');
    if (doc.status === 'Finalized') throw new Error('Already finalized.');
    if (doc.status !== 'Draft') throw new Error(`Cannot finalize from status ${doc.status}.`);
    if (!doc.receipt_id) throw new Error('Receipt is required to finalize landed cost.');

    const components = getLandedCostComponents(documentId);
    if (components.length === 0) throw new Error('At least one component is required.');

    const receiptLines = buildReceiptLineBasis(doc.receipt_id);

    for (const component of components) {
      const preview = previewLandedCostAllocation(
        component.allocation_method as AllocationMethod,
        component.kyd_amount,
        receiptLines,
      );
      assertAllocationTotal(
        preview.lines.map((l) => l.allocatedKydAmount),
        component.kyd_amount,
      );

      for (const line of preview.lines) {
        if (!line.materialLotId) continue;

        insertRow(
          `INSERT INTO cost_landed_cost_allocations (
            landed_cost_document_id, component_id, receipt_id, receipt_line_id, material_lot_id,
            allocation_basis, basis_value, allocation_percent, allocated_kyd_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            documentId,
            component.id,
            doc.receipt_id,
            line.receiptLineId,
            line.materialLotId,
            line.allocationBasis,
            line.basisValue,
            line.allocationPercent,
            line.allocatedKydAmount,
            now(),
          ],
        );

        const lotVal = getMaterialLotValuation(line.materialLotId);
        const qtyBasis = lotVal.originalReceivedQuantity || lotVal.currentQuantity || 1;

        addLandedCostToMaterialLot(
          line.materialLotId,
          documentId,
          doc.effective_date,
          line.allocatedKydAmount,
          qtyBasis,
        );

        checkLateLandedCostImpact(line.materialLotId, documentId, line.allocatedKydAmount);
      }
    }

    runQuery(
      `UPDATE cost_landed_cost_documents SET status = 'Finalized', finalized_at = ?, updated_at = ?, created_by = COALESCE(?, created_by) WHERE id = ?`,
      [now(), now(), createdBy ?? null, documentId],
    );
  });
}

function checkLateLandedCostImpact(
  materialLotId: number,
  documentId: number,
  adjustmentAmountKyd: number,
): void {
  const finalizedBatches = queryAll<{ production_batch_id: number }>(
    `SELECT DISTINCT c.production_batch_id FROM cost_material_consumptions c
     JOIN cost_batch_snapshots s ON s.production_batch_id = c.production_batch_id
     WHERE c.material_lot_id = ? AND s.snapshot_type = 'Final' AND s.status = 'Finalized'`,
    [materialLotId],
  );

  for (const batch of finalizedBatches) {
    flagPostConsumptionAdjustment({
      materialLotId,
      productionBatchId: batch.production_batch_id,
      landedCostDocumentId: documentId,
      adjustmentAmountKyd,
    });
  }
}

export function reverseLandedCost(documentId: number, reason: string, createdBy?: string | null): void {
  withDatabaseTransaction(() => {
    const doc = getLandedCostDocument(documentId);
    if (!doc) throw new Error('Document not found.');
    if (doc.status !== 'Finalized') throw new Error('Only finalized documents can be reversed.');

    const allocations = queryAll<{
      material_lot_id: number | null;
      allocated_kyd_amount: number;
    }>(
      'SELECT material_lot_id, allocated_kyd_amount FROM cost_landed_cost_allocations WHERE landed_cost_document_id = ?',
      [documentId],
    );

    for (const alloc of allocations) {
      if (!alloc.material_lot_id) continue;
      createCostAdjustment({
        targetType: 'Material Lot',
        targetId: alloc.material_lot_id,
        reason: `Reversal of ${doc.landed_cost_code}: ${reason}`,
        amountKyd: -alloc.allocated_kyd_amount,
        effectiveDate: now(),
        sourceDocumentType: 'Landed Cost Document',
        sourceDocumentId: documentId,
        createdBy,
      });
    }

    runQuery(
      `UPDATE cost_landed_cost_documents SET status = 'Reversed', reversed_at = ?, updated_at = ? WHERE id = ?`,
      [now(), now(), documentId],
    );
  });
}

export function deleteDraftLandedCostDocument(documentId: number): void {
  const doc = getLandedCostDocument(documentId);
  if (!doc) throw new Error('Document not found.');
  if (doc.status !== 'Draft') throw new Error('Only draft documents can be deleted.');
  runQuery('DELETE FROM cost_landed_cost_components WHERE landed_cost_document_id = ?', [documentId]);
  runQuery('DELETE FROM cost_landed_cost_documents WHERE id = ?', [documentId]);
}
