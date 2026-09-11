import { calculateBatchCost, assertBatchSnapshotMutable } from '../../shared/costing/batch-cost';
import { BASE_COSTING_CURRENCY } from '../../shared/costing/constants';
import { buildFxSnapshot, convertToKyd } from '../../shared/costing/fx';
import {
  computeLiquidLotValuation,
  blendAdditiveCost,
  proofDownCostConservation,
  processLossCostConservation,
  proportionalTransferCost,
} from '../../shared/costing/liquid-cost';
import {
  computeMaterialLotValuation,
  snapshotConsumptionCost,
} from '../../shared/costing/material-cost';
import { assertNoHardDelete } from '../../shared/costing/validation';
import type {
  BatchCostBreakdown,
  CostAdjustment,
  CostBatchConversionCost,
  CostBatchSnapshot,
  CostDashboardSummary,
  CostLiquidLotLayer,
  CostLandedCostDocument,
  CostMaterialLotLayer,
  CostTraceabilityNode,
  LiquidLotValuationRow,
  MaterialLotValuationRow,
} from '../types/costing';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import { nextBusinessCode } from './master-data-queries';
import { getMaterialLotBalance } from './material-inventory-queries';

const now = () => new Date().toISOString();

function getMaterialOriginalReceivedQty(lotId: number): number {
  const row = queryOne<{ qty: number }>(
    `SELECT COALESCE(SUM(base_quantity), 0) AS qty FROM mat_transactions
     WHERE material_lot_id = ? AND transaction_type IN ('Purchase Receipt', 'Opening Balance')
       AND reversal_of_transaction_id IS NULL
       AND id NOT IN (SELECT reversal_of_transaction_id FROM mat_transactions WHERE reversal_of_transaction_id IS NOT NULL)`,
    [lotId],
  );
  return row?.qty ?? 0;
}

export function createMaterialLotCostLayer(input: {
  materialLotId: number;
  sourceType: string;
  sourceId?: number | null;
  effectiveDate: string;
  quantityBasis: number;
  purchaseCostKyd: number;
  landedCostKyd: number;
  currencySnapshot?: string | null;
  exchangeRateSnapshot?: number | null;
  costStatus?: string;
}): number {
  if (input.sourceId != null) {
    const dup = queryOne<{ id: number }>(
      `SELECT id FROM cost_material_lot_layers
       WHERE material_lot_id = ? AND source_type = ? AND source_id = ? AND status = 'Active'`,
      [input.materialLotId, input.sourceType, input.sourceId],
    );
    if (dup) {
      throw new Error(
        `Duplicate cost layer blocked: ${input.sourceType} #${input.sourceId} already applied to lot ${input.materialLotId}.`,
      );
    }
  }

  const total = input.purchaseCostKyd + input.landedCostKyd;
  const unitCost = input.quantityBasis > 0 ? total / input.quantityBasis : null;
  const status =
    input.costStatus ??
    (total > 0 ? 'VALUED' : input.purchaseCostKyd === 0 && input.landedCostKyd === 0 ? 'UNVALUED' : 'VALUED');
  return insertRow(
    `INSERT INTO cost_material_lot_layers (
      material_lot_id, source_type, source_id, effective_date, quantity_basis,
      purchase_cost_kyd, landed_cost_kyd, total_cost_kyd, unit_cost_kyd,
      currency_snapshot, exchange_rate_snapshot, cost_status, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
    [
      input.materialLotId,
      input.sourceType,
      input.sourceId ?? null,
      input.effectiveDate,
      input.quantityBasis,
      input.purchaseCostKyd,
      input.landedCostKyd,
      total,
      unitCost,
      input.currencySnapshot ?? BASE_COSTING_CURRENCY,
      input.exchangeRateSnapshot ?? 1,
      status,
      now(),
    ],
  );
}

export function createMaterialLotCostLayerFromReceipt(
  materialLotId: number,
  _receiptId: number,
  receiptLineId: number,
  effectiveDate: string,
  quantityBasis: number,
  unitCost: number | null | undefined,
  currency: string | null | undefined,
  exchangeRateToKyd?: number | null,
): number {
  if (unitCost == null) {
    return createMaterialLotCostLayer({
      materialLotId,
      sourceType: 'Purchase Receipt',
      sourceId: receiptLineId,
      effectiveDate,
      quantityBasis,
      purchaseCostKyd: 0,
      landedCostKyd: 0,
      currencySnapshot: currency ?? BASE_COSTING_CURRENCY,
      exchangeRateSnapshot: exchangeRateToKyd ?? 1,
      costStatus: 'UNVALUED',
    });
  }
  const cur = (currency ?? BASE_COSTING_CURRENCY).toUpperCase();
  const rate = cur === BASE_COSTING_CURRENCY ? 1 : (exchangeRateToKyd ?? 0);
  const originalPurchase = unitCost * quantityBasis;
  const purchaseKyd =
    cur === BASE_COSTING_CURRENCY ? originalPurchase : convertToKyd(originalPurchase, rate);
  return createMaterialLotCostLayer({
    materialLotId,
    sourceType: 'Purchase Receipt',
    sourceId: receiptLineId,
    effectiveDate,
    quantityBasis,
    purchaseCostKyd: purchaseKyd,
    landedCostKyd: 0,
    currencySnapshot: cur,
    exchangeRateSnapshot: rate,
    costStatus: 'VALUED',
  });
}

export function createOpeningBalanceCostLayer(input: {
  materialLotId: number;
  effectiveDate: string;
  quantityBasis: number;
  unitCostKyd?: number | null;
  totalCostKyd?: number | null;
  knownZeroCost?: boolean;
}): number {
  if (input.knownZeroCost) {
    return createMaterialLotCostLayer({
      materialLotId: input.materialLotId,
      sourceType: 'Opening Cost',
      sourceId: null,
      effectiveDate: input.effectiveDate,
      quantityBasis: input.quantityBasis,
      purchaseCostKyd: 0,
      landedCostKyd: 0,
      costStatus: 'VALUED',
    });
  }
  if (input.unitCostKyd == null && input.totalCostKyd == null) {
    return createMaterialLotCostLayer({
      materialLotId: input.materialLotId,
      sourceType: 'Opening Cost',
      sourceId: null,
      effectiveDate: input.effectiveDate,
      quantityBasis: input.quantityBasis,
      purchaseCostKyd: 0,
      landedCostKyd: 0,
      costStatus: 'UNVALUED',
    });
  }
  const total = input.totalCostKyd ?? (input.unitCostKyd! * input.quantityBasis);
  return createMaterialLotCostLayer({
    materialLotId: input.materialLotId,
    sourceType: 'Opening Cost',
    sourceId: null,
    effectiveDate: input.effectiveDate,
    quantityBasis: input.quantityBasis,
    purchaseCostKyd: total,
    landedCostKyd: 0,
    costStatus: 'VALUED',
  });
}

export function addLandedCostToMaterialLot(
  materialLotId: number,
  landedCostDocumentId: number,
  effectiveDate: string,
  landedCostKyd: number,
  quantityBasis: number,
): number {
  return createMaterialLotCostLayer({
    materialLotId,
    sourceType: 'Landed Cost Adjustment',
    sourceId: landedCostDocumentId,
    effectiveDate,
    quantityBasis,
    purchaseCostKyd: 0,
    landedCostKyd,
    costStatus: landedCostKyd > 0 ? 'VALUED' : 'UNVALUED',
  });
}

export function getMaterialLotCostLayers(materialLotId: number): CostMaterialLotLayer[] {
  return queryAll<CostMaterialLotLayer>(
    'SELECT * FROM cost_material_lot_layers WHERE material_lot_id = ? AND status = ? ORDER BY effective_date, id',
    [materialLotId, 'Active'],
  );
}

export function getMaterialLotUnitCost(materialLotId: number): {
  unitCostKyd: number | null;
  costStatus: string;
} {
  const layers = getMaterialLotCostLayers(materialLotId);
  const originalQty = getMaterialOriginalReceivedQty(materialLotId);
  const currentQty = getMaterialLotBalance(materialLotId);
  const valuation = computeMaterialLotValuation(
    layers.map((l) => ({
      purchaseCostKyd: l.purchase_cost_kyd,
      landedCostKyd: l.landed_cost_kyd,
      totalCostKyd: l.total_cost_kyd,
      unitCostKyd: l.unit_cost_kyd ?? 0,
      quantityBasis: l.quantity_basis,
      costStatus: l.cost_status as 'UNVALUED' | 'VALUED' | 'PARTIALLY_VALUED' | 'FINALIZED' | 'ADJUSTED',
    })),
    originalQty || currentQty,
    currentQty,
  );
  return {
    unitCostKyd: valuation.historicalUnitLandedCostKyd,
    costStatus: valuation.costStatus,
  };
}

export function getMaterialLotValuation(materialLotId: number) {
  const layers = getMaterialLotCostLayers(materialLotId);
  const originalQty = getMaterialOriginalReceivedQty(materialLotId);
  const currentQty = getMaterialLotBalance(materialLotId);
  return computeMaterialLotValuation(
    layers.map((l) => ({
      purchaseCostKyd: l.purchase_cost_kyd,
      landedCostKyd: l.landed_cost_kyd,
      totalCostKyd: l.total_cost_kyd,
      unitCostKyd: l.unit_cost_kyd ?? 0,
      quantityBasis: l.quantity_basis,
      costStatus: l.cost_status as 'UNVALUED' | 'VALUED' | 'PARTIALLY_VALUED' | 'FINALIZED' | 'ADJUSTED',
    })),
    originalQty || currentQty,
    currentQty,
  );
}

export function snapshotMaterialConsumptionCost(
  materialTransactionId: number,
  productionOrderId: number | null,
  productionBatchId: number | null,
  materialLotId: number,
  baseQuantityConsumed: number,
  isReturn = false,
): number {
  const { unitCostKyd, costStatus } = getMaterialLotUnitCost(materialLotId);
  const qty = isReturn ? -baseQuantityConsumed : baseQuantityConsumed;
  const snap = snapshotConsumptionCost(unitCostKyd, Math.abs(baseQuantityConsumed), costStatus as 'UNVALUED');
  const extended = snap.extendedCostKyd != null ? (isReturn ? -snap.extendedCostKyd : snap.extendedCostKyd) : null;

  const layers = getMaterialLotCostLayers(materialLotId);
  const sourceLayerId = layers.length > 0 ? layers[layers.length - 1]!.id : null;

  return insertRow(
    `INSERT INTO cost_material_consumptions (
      material_transaction_id, production_order_id, production_batch_id, material_lot_id,
      base_quantity_consumed, unit_cost_kyd_snapshot, extended_cost_kyd, cost_status,
      source_cost_layer_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      materialTransactionId,
      productionOrderId,
      productionBatchId,
      materialLotId,
      qty,
      unitCostKyd,
      extended,
      snap.effectiveStatus,
      sourceLayerId,
      now(),
    ],
  );
}

export function createLiquidCostLayer(input: {
  liquidLotId: number;
  sourceType: string;
  sourceId?: number | null;
  productionBatchId?: number | null;
  effectiveDate: string;
  volumeLitres: number;
  lpa: number;
  inputCostKyd: number;
  conversionCostKyd?: number;
  costStatus?: string;
}): number {
  const conversion = input.conversionCostKyd ?? 0;
  const total = input.inputCostKyd + conversion;
  const costPerL = input.volumeLitres > 0 ? total / input.volumeLitres : null;
  const costPerLpa = input.lpa > 0 ? total / input.lpa : null;
  return insertRow(
    `INSERT INTO cost_liquid_lot_layers (
      liquid_lot_id, source_type, source_id, production_batch_id, effective_date,
      volume_litres, lpa, input_cost_kyd, conversion_cost_kyd, total_cost_kyd,
      cost_per_litre_kyd, cost_per_lpa_kyd, cost_status, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
    [
      input.liquidLotId,
      input.sourceType,
      input.sourceId ?? null,
      input.productionBatchId ?? null,
      input.effectiveDate,
      input.volumeLitres,
      input.lpa,
      input.inputCostKyd,
      conversion,
      total,
      costPerL,
      costPerLpa,
      input.costStatus ?? (total > 0 ? 'VALUED' : 'UNVALUED'),
      now(),
    ],
  );
}

export function getLiquidLotCostLayers(liquidLotId: number): CostLiquidLotLayer[] {
  return queryAll<CostLiquidLotLayer>(
    'SELECT * FROM cost_liquid_lot_layers WHERE liquid_lot_id = ? AND status = ? ORDER BY effective_date, id',
    [liquidLotId, 'Active'],
  );
}

export function getLiquidLotTotalCost(liquidLotId: number): number {
  const layers = getLiquidLotCostLayers(liquidLotId);
  return layers.reduce((s, l) => s + l.total_cost_kyd, 0);
}

export function getLiquidLotValuation(liquidLotId: number, currentVolumeLitres: number, currentLpa: number) {
  const layers = getLiquidLotCostLayers(liquidLotId);
  return computeLiquidLotValuation(
    layers.map((l) => ({
      volumeLitres: l.volume_litres,
      lpa: l.lpa,
      inputCostKyd: l.input_cost_kyd,
      conversionCostKyd: l.conversion_cost_kyd,
      totalCostKyd: l.total_cost_kyd,
      costStatus: l.cost_status as 'UNVALUED' | 'VALUED' | 'PARTIALLY_VALUED',
    })),
    currentVolumeLitres,
    currentLpa,
  );
}

export function createLiquidCostFromBlend(input: {
  outputLotId: number;
  productionBatchId: number;
  effectiveDate: string;
  inputLotCosts: { lotId: number; costKyd: number }[];
  materialCostKyd: number;
  conversionCostKyd: number;
  outputVolumeLitres: number;
  outputLpa: number;
}): number {
  const liquidTotal = blendAdditiveCost({
    liquidInputCostsKyd: input.inputLotCosts.map((c) => c.costKyd),
    materialCostKyd: input.materialCostKyd,
    conversionCostKyd: input.conversionCostKyd,
  });
  return createLiquidCostLayer({
    liquidLotId: input.outputLotId,
    sourceType: 'Blend',
    sourceId: input.productionBatchId,
    productionBatchId: input.productionBatchId,
    effectiveDate: input.effectiveDate,
    volumeLitres: input.outputVolumeLitres,
    lpa: input.outputLpa,
    inputCostKyd: liquidTotal - input.conversionCostKyd,
    conversionCostKyd: input.conversionCostKyd,
    costStatus: liquidTotal > 0 ? 'VALUED' : 'UNVALUED',
  });
}

export function createLiquidCostFromProofDown(input: {
  outputLotId: number;
  productionBatchId: number;
  effectiveDate: string;
  inputTotalCostKyd: number;
  waterCostKyd: number;
  conversionCostKyd: number;
  inputVolumeLitres: number;
  inputAbv: number;
  outputVolumeLitres: number;
  outputAbv: number;
}): number {
  const result = proofDownCostConservation({
    inputVolumeLitres: input.inputVolumeLitres,
    inputAbv: input.inputAbv,
    inputTotalCostKyd: input.inputTotalCostKyd,
    outputVolumeLitres: input.outputVolumeLitres,
    outputAbv: input.outputAbv,
    waterCostKyd: input.waterCostKyd,
    conversionCostKyd: input.conversionCostKyd,
  });
  return createLiquidCostLayer({
    liquidLotId: input.outputLotId,
    sourceType: 'Proof Down',
    sourceId: input.productionBatchId,
    productionBatchId: input.productionBatchId,
    effectiveDate: input.effectiveDate,
    volumeLitres: input.outputVolumeLitres,
    lpa: result.outputLpa,
    inputCostKyd: result.outputTotalCostKyd - input.conversionCostKyd,
    conversionCostKyd: input.conversionCostKyd,
    costStatus: 'VALUED',
  });
}

export function addConversionCost(input: {
  productionBatchId: number;
  costType: string;
  description: string;
  originalCurrency?: string;
  originalAmount: number;
  exchangeRateToKyd?: number;
  notes?: string;
}): number {
  const cur = (input.originalCurrency ?? BASE_COSTING_CURRENCY).toUpperCase();
  const rate = cur === BASE_COSTING_CURRENCY ? 1 : (input.exchangeRateToKyd ?? 1);
  const kyd = convertToKyd(input.originalAmount, rate);
  return insertRow(
    `INSERT INTO cost_batch_conversion_costs (
      production_batch_id, cost_type, description, original_currency, original_amount,
      exchange_rate_to_kyd, amount_kyd, status, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
    [
      input.productionBatchId,
      input.costType,
      input.description,
      cur,
      input.originalAmount,
      rate,
      kyd,
      input.notes ?? '',
      now(),
    ],
  );
}

export function getBatchConversionCosts(batchId: number): CostBatchConversionCost[] {
  return queryAll<CostBatchConversionCost>(
    'SELECT * FROM cost_batch_conversion_costs WHERE production_batch_id = ? ORDER BY id',
    [batchId],
  );
}

export function getBatchConversionCostTotal(batchId: number): number {
  return getBatchConversionCosts(batchId).reduce((s, c) => s + c.amount_kyd, 0);
}

export function getBatchMaterialCost(batchId: number): {
  total: number | null;
  unvaluedCount: number;
} {
  const rows = queryAll<{ extended_cost_kyd: number | null; cost_status: string; transaction_type?: string }>(
    `SELECT c.extended_cost_kyd, c.cost_status, t.transaction_type
     FROM cost_material_consumptions c
     JOIN mat_transactions t ON t.id = c.material_transaction_id
     WHERE c.production_batch_id = ?`,
    [batchId],
  );
  let total = 0;
  let unvalued = 0;
  for (const row of rows) {
    if (row.extended_cost_kyd == null || row.cost_status === 'UNVALUED') {
      unvalued++;
      continue;
    }
    total += row.extended_cost_kyd;
  }
  return { total: unvalued > 0 ? null : total, unvaluedCount: unvalued };
}

export function getBatchLiquidInputCost(batchId: number): {
  total: number | null;
  unvaluedCount: number;
} {
  const inputs = queryAll<{ liquid_lot_id: number; actual_volume_litres: number | null; actual_quantity: number }>(
    `SELECT liquid_lot_id, actual_volume_litres, actual_quantity FROM prod_batch_inputs
     WHERE batch_id = ? AND input_type = 'Liquid Lot' AND liquid_lot_id IS NOT NULL`,
    [batchId],
  );
  let total = 0;
  let unvalued = 0;
  for (const inp of inputs) {
    const lotCost = getLiquidLotTotalCost(inp.liquid_lot_id);
    const vol = inp.actual_volume_litres ?? inp.actual_quantity;
    const layers = getLiquidLotCostLayers(inp.liquid_lot_id);
    const valuation = getLiquidLotValuation(inp.liquid_lot_id, vol, vol * 0.96);
    if (layers.length === 0 || valuation.costStatus === 'UNVALUED') {
      unvalued++;
      continue;
    }
    const lotTotalVol = queryOne<{ vol: number }>(
      `SELECT COALESCE(SUM(CASE WHEN destination_lot_id = ? THEN volume_litres ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN source_lot_id = ? THEN volume_litres ELSE 0 END), 0) AS vol
       FROM liq_transactions WHERE source_lot_id = ? OR destination_lot_id = ?`,
      [inp.liquid_lot_id, inp.liquid_lot_id, inp.liquid_lot_id, inp.liquid_lot_id],
    )?.vol ?? vol;
    const ratio = lotTotalVol > 0 ? vol / lotTotalVol : 1;
    total += lotCost * ratio;
  }
  return { total: unvalued > 0 ? null : total, unvaluedCount: unvalued };
}

export function calculateBatchCostForBatch(
  batchId: number,
  outputVolumeLitres: number,
  outputLpa: number,
  plannedCostKyd?: number | null,
) {
  const material = getBatchMaterialCost(batchId);
  const liquid = getBatchLiquidInputCost(batchId);
  const conversion = getBatchConversionCostTotal(batchId);
  return calculateBatchCost(
    {
      materialCostKyd: material.total,
      liquidCostKyd: liquid.total,
      conversionCostKyd: conversion,
      unvaluedInputCount: material.unvaluedCount + liquid.unvaluedCount,
    },
    outputVolumeLitres,
    outputLpa,
    plannedCostKyd,
  );
}

export function recalculatePreliminaryBatchSnapshot(
  batchId: number,
  outputVolumeLitres: number,
  outputLpa: number,
  plannedCostKyd?: number | null,
): number {
  const existingFinal = queryOne<{ id: number }>(
    `SELECT id FROM cost_batch_snapshots WHERE production_batch_id = ? AND snapshot_type = 'Final' AND status = 'Finalized'`,
    [batchId],
  );
  if (existingFinal) {
    throw new Error('Cannot recalculate preliminary cost: batch has a finalized cost snapshot.');
  }
  return createPreliminaryBatchSnapshot(batchId, outputVolumeLitres, outputLpa, plannedCostKyd);
}

export function recordBatchCostError(batchId: number, errorMessage: string): number {
  const batch = queryOne<{ actual_output_litres: number; actual_output_abv: number }>(
    'SELECT actual_output_litres, actual_output_abv FROM prod_batches WHERE id = ?',
    [batchId],
  );
  const outputLpa = (batch?.actual_output_litres ?? 0) * ((batch?.actual_output_abv ?? 0) / 100);
  return insertRow(
    `INSERT INTO cost_batch_snapshots (
      production_batch_id, snapshot_type, status, conversion_cost_kyd, output_volume_litres,
      output_lpa, unvalued_input_count, created_at, notes
    ) VALUES (?, 'Preliminary', 'ERROR', 0, ?, ?, 0, ?, ?)`,
    [batchId, batch?.actual_output_litres ?? 0, outputLpa, now(), errorMessage.slice(0, 500)],
  );
}

export function createPreliminaryBatchSnapshot(
  batchId: number,
  outputVolumeLitres: number,
  outputLpa: number,
  plannedCostKyd?: number | null,
): number {
  const result = calculateBatchCostForBatch(batchId, outputVolumeLitres, outputLpa, plannedCostKyd);
  const status =
    result.unvaluedInputCount > 0 ? 'PARTIALLY_VALUED' : result.totalInputCostKyd != null ? 'Draft' : 'INCOMPLETE';
  return insertRow(
    `INSERT INTO cost_batch_snapshots (
      production_batch_id, snapshot_type, status, material_cost_kyd, liquid_cost_kyd,
      conversion_cost_kyd, total_cost_kyd, output_volume_litres, output_lpa,
      cost_per_litre_kyd, cost_per_lpa_kyd, planned_cost_kyd, variance_kyd,
      variance_percent, unvalued_input_count, created_at, notes
    ) VALUES (?, 'Preliminary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
    [
      batchId,
      status,
      result.materialCostKyd,
      result.liquidCostKyd,
      result.conversionCostKyd,
      result.totalInputCostKyd,
      outputVolumeLitres,
      outputLpa,
      result.costPerLitreKyd,
      result.costPerLpaKyd,
      result.plannedCostKyd,
      result.varianceKyd,
      result.variancePercent,
      result.unvaluedInputCount,
      now(),
    ],
  );
}

/** Attempt direct update of finalized batch snapshot — always blocked. */
export function updateBatchSnapshot(
  snapshotId: number,
  fields: Partial<{ total_cost_kyd: number; material_cost_kyd: number }>,
): void {
  const snap = queryOne<{ status: string; snapshot_type: string }>(
    'SELECT status, snapshot_type FROM cost_batch_snapshots WHERE id = ?',
    [snapshotId],
  );
  if (!snap) throw new Error('Snapshot not found.');
  if (snap.status === 'Finalized' || snap.snapshot_type === 'Final') {
    assertBatchSnapshotMutable('Finalized');
  }
  if (fields.total_cost_kyd != null) {
    runQuery('UPDATE cost_batch_snapshots SET total_cost_kyd = ? WHERE id = ?', [
      fields.total_cost_kyd,
      snapshotId,
    ]);
  }
}

export function finalizeBatchCost(batchId: number, acceptIncomplete = false): number {
  return withDatabaseTransaction(() => {
    const existing = queryOne<CostBatchSnapshot>(
      `SELECT * FROM cost_batch_snapshots WHERE production_batch_id = ? AND snapshot_type = 'Final' AND status = 'Finalized'`,
      [batchId],
    );
    if (existing) throw new Error('Batch already has a finalized cost snapshot.');

    const batch = queryOne<{ actual_output_litres: number; actual_output_abv: number }>(
      'SELECT actual_output_litres, actual_output_abv FROM prod_batches WHERE id = ?',
      [batchId],
    );
    if (!batch) throw new Error('Batch not found.');

    const outputLpa = batch.actual_output_litres * ((batch.actual_output_abv ?? 0) / 100);
    const result = calculateBatchCostForBatch(batchId, batch.actual_output_litres, outputLpa);

    if (result.unvaluedInputCount > 0 && !acceptIncomplete) {
      throw new Error(
        `Batch has ${result.unvaluedInputCount} unvalued input(s). Accept incomplete or provide costs before finalizing.`,
      );
    }

    const snapshotId = insertRow(
      `INSERT INTO cost_batch_snapshots (
        production_batch_id, snapshot_type, status, material_cost_kyd, liquid_cost_kyd,
        conversion_cost_kyd, total_cost_kyd, output_volume_litres, output_lpa,
        cost_per_litre_kyd, cost_per_lpa_kyd, planned_cost_kyd, variance_kyd,
        variance_percent, unvalued_input_count, created_at, finalized_at, notes
      ) VALUES (?, 'Final', 'Finalized', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
      [
        batchId,
        result.materialCostKyd,
        result.liquidCostKyd,
        result.conversionCostKyd,
        result.totalInputCostKyd,
        batch.actual_output_litres,
        outputLpa,
        result.costPerLitreKyd,
        result.costPerLpaKyd,
        result.plannedCostKyd,
        result.varianceKyd,
        result.variancePercent,
        result.unvaluedInputCount,
        now(),
        now(),
      ],
    );

    createProductionOutputFromBatch(batchId, snapshotId, result.totalInputCostKyd, result.costStatus);
    return snapshotId;
  });
}

function createProductionOutputFromBatch(
  batchId: number,
  _snapshotId: number,
  totalCost: number | null,
  costStatus: string,
): void {
  const batch = queryOne<{ output_lot_id: number | null; actual_output_litres: number }>(
    'SELECT output_lot_id, actual_output_litres FROM prod_batches WHERE id = ?',
    [batchId],
  );
  if (!batch?.output_lot_id) return;
  const unitCost =
    totalCost != null && batch.actual_output_litres > 0
      ? totalCost / batch.actual_output_litres
      : null;
  insertRow(
    `INSERT INTO cost_production_outputs (
      production_batch_id, output_type, liquid_lot_id, quantity, unit, base_quantity, base_unit,
      allocated_batch_cost_kyd, unit_cost_kyd, cost_status, created_at
    ) VALUES (?, 'Liquid Lot', ?, ?, 'L', ?, 'L', ?, ?, ?, ?)`,
    [
      batchId,
      batch.output_lot_id,
      batch.actual_output_litres,
      batch.actual_output_litres,
      totalCost,
      unitCost,
      costStatus === 'VALUED' ? 'VALUED' : 'PARTIALLY_VALUED',
      now(),
    ],
  );
}

export function getBatchSnapshot(batchId: number, snapshotType?: string): CostBatchSnapshot | null {
  if (snapshotType) {
    return queryOne<CostBatchSnapshot>(
      'SELECT * FROM cost_batch_snapshots WHERE production_batch_id = ? AND snapshot_type = ? ORDER BY id DESC LIMIT 1',
      [batchId, snapshotType],
    );
  }
  return queryOne<CostBatchSnapshot>(
    'SELECT * FROM cost_batch_snapshots WHERE production_batch_id = ? ORDER BY id DESC LIMIT 1',
    [batchId],
  );
}

export function assertBatchSnapshotNotFinalized(batchId: number): void {
  const snap = queryOne<{ status: string }>(
    `SELECT status FROM cost_batch_snapshots WHERE production_batch_id = ? AND snapshot_type = 'Final' AND status = 'Finalized'`,
    [batchId],
  );
  if (snap) assertBatchSnapshotMutable('Finalized');
}

export function reverseCostAdjustment(
  adjustmentId: number,
  reason: string,
  createdBy?: string | null,
): number {
  const adj = queryOne<CostAdjustment>('SELECT * FROM cost_adjustments WHERE id = ?', [adjustmentId]);
  if (!adj) throw new Error('Adjustment not found.');
  return createCostAdjustment({
    targetType: adj.target_type,
    targetId: adj.target_id,
    reason: `Reversal: ${reason}`,
    amountKyd: -adj.amount_kyd,
    effectiveDate: now(),
    sourceDocumentType: 'Cost Adjustment',
    sourceDocumentId: adjustmentId,
    createdBy,
    reversalOfAdjustmentId: adjustmentId,
  });
}

export function getEffectiveBatchCostWithAdjustments(batchId: number): number | null {
  const snap = getBatchSnapshot(batchId, 'Final') ?? getBatchSnapshot(batchId, 'Preliminary');
  const base = snap?.total_cost_kyd ?? null;
  if (base == null) return null;
  const adjSum =
    queryAll<{ amount_kyd: number }>(
      `SELECT amount_kyd FROM cost_adjustments WHERE target_type = 'Production Batch' AND target_id = ?`,
      [batchId],
    ).reduce((s, a) => s + a.amount_kyd, 0) ?? 0;
  return base + adjSum;
}

export function getPostConsumptionFlags(filters?: { batchId?: number; lotId?: number }) {
  let sql = 'SELECT * FROM cost_post_consumption_flags WHERE 1=1';
  const params: number[] = [];
  if (filters?.batchId) {
    sql += ' AND production_batch_id = ?';
    params.push(filters.batchId);
  }
  if (filters?.lotId) {
    sql += ' AND material_lot_id = ?';
    params.push(filters.lotId);
  }
  sql += ' ORDER BY created_at DESC';
  return queryAll<{
    id: number;
    material_lot_id: number;
    production_batch_id: number;
    landed_cost_document_id: number;
    adjustment_amount_kyd: number;
    status: string;
    notes: string;
  }>(sql, params);
}

export function allocateProductionOutputsManual(input: {
  batchId: number;
  allocations: { outputId: number; percent: number }[];
}): void {
  const snap = getBatchSnapshot(input.batchId, 'Final');
  const total = snap?.total_cost_kyd;
  if (total == null) throw new Error('Batch total cost required for output allocation.');
  const pctSum = input.allocations.reduce((s, a) => s + a.percent, 0);
  if (Math.abs(pctSum - 100) > 0.01) {
    throw new Error('Manual output allocation must total 100%.');
  }
  for (const alloc of input.allocations) {
    const amount = (total * alloc.percent) / 100;
    runQuery(
      `UPDATE cost_production_outputs SET allocated_batch_cost_kyd = ?, cost_status = 'VALUED' WHERE id = ?`,
      [amount, alloc.outputId],
    );
  }
}

export function createCostAdjustment(input: {
  targetType: string;
  targetId: number;
  reason: string;
  amountKyd: number;
  effectiveDate: string;
  sourceDocumentType?: string | null;
  sourceDocumentId?: number | null;
  notes?: string;
  createdBy?: string | null;
  reversalOfAdjustmentId?: number | null;
}): number {
  const code = nextBusinessCode('costAdjustment', 'cost_adjustments', 'adjustment_code');
  return insertRow(
    `INSERT INTO cost_adjustments (
      adjustment_code, target_type, target_id, reason, amount_kyd, effective_date,
      source_document_type, source_document_id, notes, created_by, created_at,
      reversal_of_adjustment_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.targetType,
      input.targetId,
      input.reason,
      input.amountKyd,
      input.effectiveDate,
      input.sourceDocumentType ?? null,
      input.sourceDocumentId ?? null,
      input.notes ?? '',
      input.createdBy ?? null,
      now(),
      input.reversalOfAdjustmentId ?? null,
    ],
  );
}

export function flagPostConsumptionAdjustment(input: {
  materialLotId: number;
  productionBatchId: number;
  landedCostDocumentId: number;
  adjustmentAmountKyd: number;
  notes?: string;
}): number {
  return insertRow(
    `INSERT INTO cost_post_consumption_flags (
      material_lot_id, production_batch_id, landed_cost_document_id,
      adjustment_amount_kyd, status, notes, created_at
    ) VALUES (?, ?, ?, ?, 'Pending Review', ?, ?)`,
    [
      input.materialLotId,
      input.productionBatchId,
      input.landedCostDocumentId,
      input.adjustmentAmountKyd,
      input.notes ?? 'Late landed cost after batch cost finalization',
      now(),
    ],
  );
}

export function listMaterialValuations(filters?: {
  materialType?: string;
  costStatus?: string;
}): MaterialLotValuationRow[] {
  let sql = `
    SELECT l.id AS material_lot_id, l.lot_code, l.material_type,
           COALESCE(rm.name, pm.name) AS material_name,
           s.company_name AS supplier_name,
           r.receipt_code,
           l.id
    FROM mat_lots l
    LEFT JOIN md_raw_materials rm ON rm.id = l.raw_material_id
    LEFT JOIN md_packaging_materials pm ON pm.id = l.packaging_material_id
    LEFT JOIN md_suppliers s ON s.id = l.supplier_id
    LEFT JOIN pur_receipt_lines rl ON rl.material_lot_id = l.id
    LEFT JOIN pur_receipts r ON r.id = rl.receipt_id
    WHERE (rm.inventory_tracking_mode = 'LEDGER' OR pm.inventory_tracking_mode = 'LEDGER')
  `;
  const params: (string | number)[] = [];
  if (filters?.materialType) {
    sql += ' AND l.material_type = ?';
    params.push(filters.materialType);
  }
  sql += ' GROUP BY l.id ORDER BY l.lot_code';
  const rows = queryAll<{
    material_lot_id: number;
    lot_code: string;
    material_type: string;
    material_name: string;
    supplier_name: string | null;
    receipt_code: string | null;
  }>(sql, params);

  return rows.map((row) => {
    const val = getMaterialLotValuation(row.material_lot_id);
    const originalQty = getMaterialOriginalReceivedQty(row.material_lot_id);
    const currentQty = getMaterialLotBalance(row.material_lot_id);
    return {
      material_lot_id: row.material_lot_id,
      lot_code: row.lot_code,
      material_name: row.material_name,
      material_type: row.material_type,
      supplier_name: row.supplier_name,
      receipt_code: row.receipt_code,
      received_qty: originalQty,
      remaining_qty: currentQty,
      purchase_cost_kyd: val.originalPurchaseCostKyd,
      landed_cost_kyd: val.allocatedLandedCostKyd,
      total_cost_kyd: val.totalHistoricalLotCostKyd,
      unit_cost_kyd: val.historicalUnitLandedCostKyd,
      remaining_value_kyd: val.remainingInventoryValueKyd,
      cost_status: val.costStatus,
    };
  }).filter((r) => !filters?.costStatus || r.cost_status === filters.costStatus);
}

export function listLiquidValuations(): LiquidLotValuationRow[] {
  const lots = queryAll<{
    id: number;
    lot_code: string;
    lot_type: string;
  }>(
    `SELECT l.id, l.lot_code, l.lot_type FROM liq_lots l
     JOIN liq_transactions t ON t.destination_lot_id = l.id OR t.source_lot_id = l.id
     LEFT JOIN liq_tanks tk ON tk.id = t.destination_tank_id OR tk.id = t.source_tank_id
     WHERE tk.tracking_mode = 'LEDGER' OR tk.id IS NULL
     GROUP BY l.id`,
  );

  return lots.map((lot) => {
    const balance = queryOne<{ vol: number; abv: number }>(
      `SELECT
        COALESCE(SUM(CASE WHEN destination_lot_id = ? THEN volume_litres ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN source_lot_id = ? THEN volume_litres ELSE 0 END), 0) AS vol,
        MAX(CASE WHEN destination_lot_id = ? THEN abv ELSE NULL END) AS abv
       FROM liq_transactions WHERE source_lot_id = ? OR destination_lot_id = ?`,
      [lot.id, lot.id, lot.id, lot.id, lot.id],
    );
    const vol = balance?.vol ?? 0;
    const abv = balance?.abv ?? 0;
    const lpa = vol * (abv / 100);
    const val = getLiquidLotValuation(lot.id, vol, lpa);
    const batchCode = queryOne<{ batch_code: string }>(
      `SELECT b.batch_code FROM prod_batches b
       JOIN cost_liquid_lot_layers cl ON cl.production_batch_id = b.id
       WHERE cl.liquid_lot_id = ? LIMIT 1`,
      [lot.id],
    )?.batch_code ?? null;
    return {
      liquid_lot_id: lot.id,
      lot_code: lot.lot_code,
      lot_type: lot.lot_type,
      current_volume_litres: vol,
      current_abv: abv,
      current_lpa: lpa,
      accumulated_cost_kyd: val.accumulatedCostKyd,
      cost_per_litre_kyd: val.costPerLitreKyd,
      cost_per_lpa_kyd: val.costPerLpaKyd,
      cost_status: val.costStatus,
      source_batch_code: batchCode,
    };
  });
}

export function getBatchCostBreakdown(batchId: number): BatchCostBreakdown {
  const batch = queryOne<{ batch_code: string }>('SELECT batch_code FROM prod_batches WHERE id = ?', [batchId]);
  const materialCosts = queryAll<{
    material_name: string;
    lot_code: string;
    base_quantity_consumed: number;
    unit_cost_kyd_snapshot: number | null;
    extended_cost_kyd: number | null;
    cost_status: string;
    base_unit: string;
    supplier_name: string | null;
    receipt_code: string | null;
  }>(
    `SELECT COALESCE(rm.name, pm.name) AS material_name, ml.lot_code,
            c.base_quantity_consumed, c.unit_cost_kyd_snapshot, c.extended_cost_kyd, c.cost_status,
            t.base_unit, s.company_name AS supplier_name, r.receipt_code
     FROM cost_material_consumptions c
     JOIN mat_transactions t ON t.id = c.material_transaction_id
     JOIN mat_lots ml ON ml.id = c.material_lot_id
     LEFT JOIN md_raw_materials rm ON rm.id = t.raw_material_id
     LEFT JOIN md_packaging_materials pm ON pm.id = t.packaging_material_id
     LEFT JOIN md_suppliers s ON s.id = ml.supplier_id
     LEFT JOIN pur_receipt_lines rl ON rl.material_lot_id = ml.id
     LEFT JOIN pur_receipts r ON r.id = rl.receipt_id
     WHERE c.production_batch_id = ?`,
    [batchId],
  );

  const liquidCosts = queryAll<{
    lot_code: string;
    actual_volume_litres: number | null;
    actual_quantity: number;
    actual_abv: number | null;
    liquid_lot_id: number;
  }>(
    `SELECT ll.lot_code, bi.actual_volume_litres, bi.actual_quantity, bi.actual_abv, bi.liquid_lot_id
     FROM prod_batch_inputs bi
     JOIN liq_lots ll ON ll.id = bi.liquid_lot_id
     WHERE bi.batch_id = ? AND bi.input_type = 'Liquid Lot'`,
    [batchId],
  ).map((li) => {
    const vol = li.actual_volume_litres ?? li.actual_quantity;
    const abv = li.actual_abv ?? 0;
    const lpa = vol * (abv / 100);
    const val = getLiquidLotValuation(li.liquid_lot_id, vol, lpa);
    const extended = val.costPerLitreKyd != null ? val.costPerLitreKyd * vol : null;
    return {
      lotCode: li.lot_code,
      volumeLitres: vol,
      abv,
      lpa,
      costPerLitreKyd: val.costPerLitreKyd,
      costPerLpaKyd: val.costPerLpaKyd,
      extendedCostKyd: extended,
      sourceBatchCode: null as string | null,
    };
  });

  const conversionCosts = getBatchConversionCosts(batchId).map((c) => ({
    costType: c.cost_type,
    description: c.description,
    amountKyd: c.amount_kyd,
  }));

  return {
    batchId,
    batchCode: batch?.batch_code ?? '',
    materialCosts: materialCosts.map((m) => ({
      materialName: m.material_name,
      lotCode: m.lot_code,
      quantity: m.base_quantity_consumed,
      unit: m.base_unit,
      unitCostKyd: m.unit_cost_kyd_snapshot,
      extendedCostKyd: m.extended_cost_kyd,
      costStatus: m.cost_status as 'UNVALUED',
      supplierName: m.supplier_name,
      receiptCode: m.receipt_code,
    })),
    liquidCosts,
    conversionCosts,
    snapshot: getBatchSnapshot(batchId),
  };
}

export function getCostTraceability(batchId: number): CostTraceabilityNode {
  const batch = queryOne<{ batch_code: string; id: number }>(
    'SELECT id, batch_code FROM prod_batches WHERE id = ?',
    [batchId],
  );
  const snap = getBatchSnapshot(batchId);
  const children: CostTraceabilityNode[] = [];

  const consumptions = queryAll<{
    lot_code: string;
    material_lot_id: number;
    extended_cost_kyd: number | null;
    receipt_code: string | null;
  }>(
    `SELECT ml.lot_code, c.material_lot_id, c.extended_cost_kyd, r.receipt_code
     FROM cost_material_consumptions c
     JOIN mat_lots ml ON ml.id = c.material_lot_id
     LEFT JOIN pur_receipt_lines rl ON rl.material_lot_id = ml.id
     LEFT JOIN pur_receipts r ON r.id = rl.receipt_id
     WHERE c.production_batch_id = ?`,
    [batchId],
  );

  for (const c of consumptions) {
    children.push({
      entityType: 'Material Lot',
      entityId: c.material_lot_id,
      code: c.lot_code,
      description: c.receipt_code ? `Receipt ${c.receipt_code}` : 'Material consumption',
      costKyd: c.extended_cost_kyd,
      children: [],
    });
  }

  return {
    entityType: 'Production Batch',
    entityId: batchId,
    code: batch?.batch_code ?? '',
    description: 'Batch cost traceability',
    costKyd: snap?.total_cost_kyd ?? null,
    children,
  };
}

export function getCostDashboardSummary(): CostDashboardSummary {
  const materialRows = listMaterialValuations();
  const liquidRows = listLiquidValuations();

  const valuedMaterial = materialRows.filter((r) => r.cost_status === 'VALUED');
  const valuedLiquid = liquidRows.filter((r) => r.cost_status === 'VALUED');

  const knownMaterialValue =
    valuedMaterial.length > 0
      ? valuedMaterial.reduce((s, r) => s + (r.remaining_value_kyd ?? 0), 0)
      : null;

  const knownLiquidValue =
    valuedLiquid.length > 0
      ? valuedLiquid.reduce((s, r) => s + r.accumulated_cost_kyd, 0)
      : null;

  const materialHasPartial = materialRows.some(
    (r) => r.cost_status === 'UNVALUED' || r.cost_status === 'PARTIALLY_VALUED',
  );
  const liquidHasPartial = liquidRows.some(
    (r) => r.cost_status === 'UNVALUED' || r.cost_status === 'PARTIALLY_VALUED',
  );

  const materialValue =
    valuedMaterial.length === materialRows.length && materialRows.length > 0
      ? knownMaterialValue
      : materialHasPartial
        ? knownMaterialValue
        : null;

  const liquidValue =
    valuedLiquid.length === liquidRows.length && liquidRows.length > 0
      ? knownLiquidValue
      : liquidHasPartial
        ? knownLiquidValue
        : null;

  const unvaluedMaterial = materialRows.filter((r) => r.cost_status === 'UNVALUED').length;
  const unvaluedLiquid = liquidRows.filter((r) => r.cost_status === 'UNVALUED').length;

  const batchesAwaiting = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM prod_batches b
     WHERE b.status = 'Completed'
       AND NOT EXISTS (
         SELECT 1 FROM cost_batch_snapshots s
         WHERE s.production_batch_id = b.id AND s.snapshot_type = 'Final' AND s.status = 'Finalized'
       )`,
  )?.count ?? 0;

  const recentLanded = queryAll<CostLandedCostDocument>(
    'SELECT * FROM cost_landed_cost_documents ORDER BY created_at DESC LIMIT 5',
  );
  const recentAdj = queryAll<CostAdjustment>(
    'SELECT * FROM cost_adjustments ORDER BY created_at DESC LIMIT 5',
  );

  const hasPartial =
    materialRows.some((r) => r.cost_status === 'PARTIALLY_VALUED') ||
    liquidRows.some((r) => r.cost_status === 'PARTIALLY_VALUED') ||
    unvaluedMaterial > 0 ||
    unvaluedLiquid > 0;

  return {
    knownMaterialInventoryValueKyd: knownMaterialValue,
    knownLiquidInventoryValueKyd: knownLiquidValue,
    materialInventoryValueKyd: materialValue,
    liquidInventoryValueKyd: liquidValue,
    unvaluedMaterialLots: unvaluedMaterial,
    unvaluedLiquidLots: unvaluedLiquid,
    batchesAwaitingCostFinalization: batchesAwaiting,
    recentLandedCostDocuments: recentLanded,
    recentAdjustments: recentAdj,
    valuationStatus: hasPartial ? 'PARTIALLY_VALUED' : materialValue != null ? 'VALUED' : 'UNVALUED',
  };
}

export function deleteDraftCostRecord(table: string, id: number, statusColumn = 'status', draftValue = 'Draft'): void {
  const row = queryOne<{ status: string }>(`SELECT ${statusColumn} AS status FROM ${table} WHERE id = ?`, [id]);
  if (!row) throw new Error('Record not found.');
  assertNoHardDelete(row.status);
  if (row.status !== draftValue && row.status !== 'Draft') {
    throw new Error('Only draft records can be deleted.');
  }
  runQuery(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

export {
  blendAdditiveCost,
  proofDownCostConservation,
  processLossCostConservation,
  proportionalTransferCost,
  buildFxSnapshot,
};
