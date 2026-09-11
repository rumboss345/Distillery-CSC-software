/**
 * Phase 1H finished goods ledger, packaging runs & COGS handoff.
 */
import { FG_TRANSACTION_TYPES } from '../../shared/finished-goods/constants';
import { validatePositiveVolume } from '../../shared/liquid-ledger/validation';
import type {
  CompletePackagingRunInput,
  CreatePackagingRunInput,
  FgInventoryRow,
  FgLot,
  FgTransaction,
  PkgRun,
} from '../types/finished-goods';
import {
  getBatchConversionCostTotal,
  getBatchMaterialCost,
  getLiquidPositionCostForVolume,
} from './costing-queries';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import { getLotVolumeInTank, postTransaction } from './liquid-ledger-queries';
import { nextBusinessCode } from './master-data-queries';
import { postProductionIssue } from './material-inventory-queries';
import { getBatch, getOrder } from './production-orders-queries';
import { assertEntityNotOnHold } from './quality-hold-guard';

const now = () => new Date().toISOString();

let fgGroupSeq = 0;
function nextFgGroupId(): string {
  fgGroupSeq += 1;
  return `FGO-${String(fgGroupSeq).padStart(6, '0')}-${Date.now()}`;
}

function isFgTransactionReversed(transactionId: number): boolean {
  return queryOne<{ id: number }>(
    'SELECT id FROM fg_transactions WHERE reversal_of_transaction_id = ?',
    [transactionId],
  ) != null;
}

function assertLedgerLocation(locationId: number): { id: number; name: string } {
  const loc = queryOne<{ id: number; name: string; active: number }>(
    'SELECT id, name, active FROM md_storage_locations WHERE id = ?',
    [locationId],
  );
  if (!loc || !loc.active) throw new Error('Destination location not found or inactive.');
  return loc;
}

function assertLedgerTank(tankId: number): { id: number; tracking_mode: string } {
  const tank = queryOne<{ id: number; tracking_mode: string }>(
    'SELECT id, tracking_mode FROM liq_tanks WHERE id = ?',
    [tankId],
  );
  if (!tank) throw new Error('Source tank not found.');
  if (tank.tracking_mode !== 'LEDGER') throw new Error('Source tank must be LEDGER-managed.');
  return tank;
}

export function computeFgLotBalance(fgLotId: number, locationId?: number | null): number {
  const activeFilter = `
    reversal_of_transaction_id IS NULL
    AND id NOT IN (SELECT reversal_of_transaction_id FROM fg_transactions WHERE reversal_of_transaction_id IS NOT NULL)`;

  if (locationId != null) {
    const row = queryOne<{ qty: number }>(
      `SELECT
        COALESCE(SUM(CASE WHEN destination_location_id = ? THEN base_quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN source_location_id = ? THEN base_quantity ELSE 0 END), 0) AS qty
       FROM fg_transactions
       WHERE fg_lot_id = ? AND ${activeFilter}`,
      [locationId, locationId, fgLotId],
    );
    return Math.max(0, row?.qty ?? 0);
  }

  const row = queryOne<{ qty: number }>(
    `SELECT
      COALESCE(SUM(CASE WHEN destination_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN source_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) AS qty
     FROM fg_transactions
     WHERE fg_lot_id = ? AND ${activeFilter}`,
    [fgLotId],
  );
  return Math.max(0, row?.qty ?? 0);
}

export function computeSkuBalance(skuId: number, locationId?: number | null): number {
  const lots = queryAll<{ id: number }>('SELECT id FROM fg_lots WHERE sku_id = ?', [skuId]);
  return lots.reduce((s, lot) => s + computeFgLotBalance(lot.id, locationId), 0);
}

function insertFgTransaction(input: {
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
}): number {
  if (!FG_TRANSACTION_TYPES.includes(input.transactionType as (typeof FG_TRANSACTION_TYPES)[number])) {
    throw new Error(`Invalid finished goods transaction type: ${input.transactionType}`);
  }
  const code = nextBusinessCode('fgTransaction', 'fg_transactions', 'transaction_code');
  const extended =
    input.unitCostKyd != null ? input.unitCostKyd * input.quantity : null;
  return insertRow(
    `INSERT INTO fg_transactions (
      transaction_code, transaction_type, transaction_timestamp, fg_lot_id, sku_id,
      source_location_id, destination_location_id, quantity, base_quantity, base_unit,
      transaction_group_id, reference_type, reference_id, unit_cost_kyd_snapshot,
      extended_cost_kyd, reason_code, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'each', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  );
}

export function getPackagingRun(runId: number): PkgRun | null {
  return queryOne<PkgRun>('SELECT * FROM pkg_runs WHERE id = ?', [runId]);
}

export function listPackagingRuns(filters?: { batchId?: number; status?: string }): PkgRun[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.batchId != null) {
    clauses.push('production_batch_id = ?');
    params.push(filters.batchId);
  }
  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<PkgRun>(`SELECT * FROM pkg_runs ${where} ORDER BY created_at DESC`, params as (string | number)[]);
}

export function createPackagingRun(input: CreatePackagingRunInput): number {
  return withDatabaseTransaction(() => {
    const batch = getBatch(input.productionBatchId);
    if (!batch) throw new Error('Production batch not found.');
    if (batch.status !== 'Completed') {
      throw new Error('Packaging run requires a completed production batch.');
    }
    const order = getOrder(batch.production_order_id);
    if (!order) throw new Error('Production order not found.');

    const sku = queryOne<{ id: number; package_size: number; containers_per_case: number }>(
      'SELECT id, package_size, containers_per_case FROM md_skus WHERE id = ? AND status = ?',
      [input.skuId, 'Active'],
    );
    if (!sku) throw new Error('SKU not found or inactive.');

    assertLedgerTank(input.sourceTankId);
    const lotInTank = getLotVolumeInTank(input.liquidLotId, input.sourceTankId);
    if (lotInTank.volumeLitres <= 0) {
      throw new Error('Liquid lot has no volume in the source tank.');
    }

    const existing = queryOne<{ id: number }>(
      `SELECT id FROM pkg_runs WHERE production_batch_id = ? AND status NOT IN ('Cancelled', 'Completed')`,
      [input.productionBatchId],
    );
    if (existing) throw new Error('An open packaging run already exists for this batch.');

    const bomRows = queryAll<{ packaging_material_id: number; quantity: number; quantity_basis: string }>(
      `SELECT rp.packaging_material_id, rp.quantity, rp.quantity_basis
       FROM rc_recipe_packaging rp
       WHERE rp.recipe_version_id = ? AND (rp.sku_id IS NULL OR rp.sku_id = ?)`,
      [order.recipe_version_id, input.skuId],
    );

    const runCode = nextBusinessCode('packagingRun', 'pkg_runs', 'run_code');
    const ts = now();
    return insertRow(
      `INSERT INTO pkg_runs (
        run_code, production_order_id, production_batch_id, sku_id, liquid_lot_id, source_tank_id,
        destination_location_id, planned_quantity, package_size_ml, units_per_case,
        packaging_bom_snapshot, liquid_volume_litres, liquid_lpa, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)`,
      [
        runCode,
        order.id,
        batch.id,
        input.skuId,
        input.liquidLotId,
        input.sourceTankId,
        input.destinationLocationId ?? null,
        input.plannedQuantity,
        input.packageSizeMl ?? sku.package_size,
        input.unitsPerCase ?? sku.containers_per_case,
        JSON.stringify(bomRows),
        lotInTank.volumeLitres,
        lotInTank.lpa,
        input.notes ?? '',
        ts,
        ts,
      ],
    );
  });
}

export function startPackagingRun(runId: number, operatorId?: string | null): void {
  const run = getPackagingRun(runId);
  if (!run) throw new Error('Packaging run not found.');
  if (run.status !== 'Draft' && run.status !== 'Ready') {
    throw new Error('Only Draft or Ready runs can be started.');
  }
  runQuery(
    `UPDATE pkg_runs SET status = 'In Progress', started_at = ?, operator_id = COALESCE(?, operator_id), updated_at = ? WHERE id = ?`,
    [now(), operatorId ?? null, now(), runId],
  );
}

export function completePackagingRun(input: CompletePackagingRunInput): { fgLotId: number; runId: number } {
  return withDatabaseTransaction(() => {
    const run = getPackagingRun(input.runId);
    if (!run) throw new Error('Packaging run not found.');
    if (run.status === 'Completed') throw new Error('Packaging run is already completed.');
    if (run.status !== 'In Progress' && run.status !== 'Ready' && run.status !== 'Draft') {
      throw new Error('Packaging run cannot be completed from current status.');
    }

    validatePositiveVolume(input.liquidConsumedLitres, 'Liquid consumed');
    validatePositiveVolume(input.actualGoodQuantity, 'Actual good quantity');

    const batch = getBatch(run.production_batch_id);
    if (!batch || batch.status !== 'Completed') {
      throw new Error('Production batch must be completed before packaging.');
    }

    assertLedgerTank(run.source_tank_id);
    const lotInTank = getLotVolumeInTank(run.liquid_lot_id, run.source_tank_id);
    if (lotInTank.volumeLitres < input.liquidConsumedLitres) {
      throw new Error('Insufficient liquid in source tank for packaging consumption.');
    }

    const destLocationId = run.destination_location_id;
    if (destLocationId == null) throw new Error('Packaging run requires a destination location.');
    assertLedgerLocation(destLocationId);

    const packageSizeMl = run.package_size_ml ?? 750;
    const theoreticalUnits =
      packageSizeMl > 0 ? (input.liquidConsumedLitres * 1000) / packageSizeMl : null;
    const packagingYield =
      theoreticalUnits != null && theoreticalUnits > 0
        ? (input.actualGoodQuantity / theoreticalUnits) * 100
        : null;
    const liquidYield =
      run.liquid_volume_litres != null && run.liquid_volume_litres > 0
        ? (input.liquidConsumedLitres / run.liquid_volume_litres) * 100
        : null;

    const liquidCost = getLiquidPositionCostForVolume(
      run.liquid_lot_id,
      run.source_tank_id,
      input.liquidConsumedLitres,
    );
    const materialCost = getBatchMaterialCost(run.production_batch_id);
    const conversionCost = getBatchConversionCostTotal(run.production_batch_id);
    const totalCost = liquidCost + (materialCost.total ?? 0) + conversionCost;
    const unitCost = input.actualGoodQuantity > 0 ? totalCost / input.actualGoodQuantity : null;
    const costStatus = totalCost > 0 && unitCost != null ? 'VALUED' : 'UNVALUED';

    const groupId = nextFgGroupId();
    const abv = lotInTank.volumeLitres > 0
      ? (lotInTank.lpa / lotInTank.volumeLitres) * 100
      : 0;

    postTransaction({
      transaction_type: 'Bottling Withdrawal',
      transaction_timestamp: now(),
      source_tank_id: run.source_tank_id,
      destination_tank_id: null,
      source_lot_id: run.liquid_lot_id,
      destination_lot_id: null,
      volume_litres: input.liquidConsumedLitres,
      abv,
      reason_code: null,
      source_document_type: 'packaging_run',
      source_document_id: run.id,
      notes: input.notes ?? `Packaging run ${run.run_code}`,
      created_by: input.operatorId ?? null,
      transaction_group_id: groupId,
    });

    const materialAlreadyPosted =
      (queryOne<{ c: number }>(
        `SELECT COUNT(*) AS c FROM mat_transactions
         WHERE production_batch_id = ? AND transaction_type = 'Production Issue'
           AND reversal_of_transaction_id IS NULL`,
        [run.production_batch_id],
      )?.c ?? 0) > 0;

    if (!materialAlreadyPosted) {
      const matInputs = queryAll<{
        packaging_material_id: number | null;
        material_lot_id: number | null;
        source_location_id: number | null;
        actual_quantity: number;
        unit: string;
      }>(
        `SELECT packaging_material_id, material_lot_id, source_location_id, actual_quantity, unit
         FROM prod_batch_inputs WHERE batch_id = ? AND input_type = 'Packaging'`,
        [run.production_batch_id],
      );

      for (const mi of matInputs) {
        if (mi.packaging_material_id == null || mi.material_lot_id == null || mi.source_location_id == null) {
          continue;
        }
        if (run.production_order_id == null) {
          throw new Error('Packaging run requires a production order for material issue.');
        }
        postProductionIssue({
          materialType: 'PACKAGING_MATERIAL',
          packagingMaterialId: mi.packaging_material_id,
          materialLotId: mi.material_lot_id,
          sourceLocationId: mi.source_location_id,
          quantity: mi.actual_quantity,
          unit: mi.unit,
          baseQuantity: mi.actual_quantity,
          baseUnit: 'each',
          productionOrderId: run.production_order_id,
          productionBatchId: run.production_batch_id,
          transactionGroupId: groupId,
          createdBy: input.operatorId ?? null,
        });
      }
    }

    const lotCode = nextBusinessCode('fgLot', 'fg_lots', 'fg_lot_code');
    const productionDate = input.productionDate ?? now().slice(0, 10);
    const fgLotId = insertRow(
      `INSERT INTO fg_lots (
        fg_lot_code, printed_lot_code, sku_id, production_order_id, production_batch_id,
        packaging_run_id, production_date, best_before_date, expiration_date,
        status, quality_status, cost_status, unit_cost_kyd, total_cost_kyd,
        initial_quantity, base_unit, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', 'Pending', ?, ?, ?, ?, 'each', ?, ?, ?)`,
      [
        lotCode,
        input.printedLotCode ?? null,
        run.sku_id,
        run.production_order_id,
        run.production_batch_id,
        run.id,
        productionDate,
        input.bestBeforeDate ?? null,
        input.expirationDate ?? null,
        costStatus,
        unitCost,
        totalCost,
        input.actualGoodQuantity,
        input.notes ?? '',
        now(),
        now(),
      ],
    );

    insertFgTransaction({
      transactionType: 'Production Receipt',
      fgLotId,
      skuId: run.sku_id,
      destinationLocationId: destLocationId,
      quantity: input.actualGoodQuantity,
      transactionGroupId: groupId,
      referenceType: 'packaging_run',
      referenceId: run.id,
      unitCostKyd: unitCost,
      notes: `Production receipt from ${run.run_code}`,
      createdBy: input.operatorId ?? null,
    });

    if ((input.sampleQuantity ?? 0) > 0) {
      insertFgTransaction({
        transactionType: 'Sample',
        fgLotId,
        skuId: run.sku_id,
        sourceLocationId: destLocationId,
        quantity: input.sampleQuantity!,
        transactionGroupId: groupId,
        unitCostKyd: unitCost,
        reasonCode: 'Sampling',
        notes: 'Packaging sample',
        createdBy: input.operatorId ?? null,
      });
    }

    if ((input.breakageQuantity ?? 0) > 0) {
      insertFgTransaction({
        transactionType: 'Breakage',
        fgLotId,
        skuId: run.sku_id,
        sourceLocationId: destLocationId,
        quantity: input.breakageQuantity!,
        transactionGroupId: groupId,
        unitCostKyd: unitCost,
        reasonCode: 'Breakage',
        notes: 'Packaging breakage',
        createdBy: input.operatorId ?? null,
      });
    }

    insertRow(
      `INSERT INTO cost_production_outputs (
        production_batch_id, output_type, liquid_lot_id, sku_id, finished_goods_lot_id,
        quantity, unit, base_quantity, base_unit, allocated_batch_cost_kyd, unit_cost_kyd,
        cost_status, created_at
      ) VALUES (?, 'Finished SKU', ?, ?, ?, ?, 'each', ?, 'each', ?, ?, ?, ?)`,
      [
        run.production_batch_id,
        run.liquid_lot_id,
        run.sku_id,
        fgLotId,
        input.actualGoodQuantity,
        input.actualGoodQuantity,
        totalCost,
        unitCost,
        costStatus,
        now(),
      ],
    );

    runQuery(
      `UPDATE pkg_runs SET
        status = 'Completed', completed_at = ?, actual_good_quantity = ?,
        rejected_quantity = ?, sample_quantity = ?, breakage_quantity = ?,
        liquid_consumed_litres = ?, liquid_loss_litres = ?,
        theoretical_units = ?, packaging_yield_percent = ?, liquid_yield_percent = ?,
        operator_id = COALESCE(?, operator_id), notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
      [
        now(),
        input.actualGoodQuantity,
        input.rejectedQuantity ?? 0,
        input.sampleQuantity ?? 0,
        input.breakageQuantity ?? 0,
        input.liquidConsumedLitres,
        input.liquidLossLitres ?? 0,
        theoreticalUnits,
        packagingYield,
        liquidYield,
        input.operatorId ?? null,
        input.notes ?? null,
        now(),
        run.id,
      ],
    );

    return { fgLotId, runId: run.id };
  });
}

export function transferFgLot(input: {
  fgLotId: number;
  sourceLocationId: number;
  destinationLocationId: number;
  quantity: number;
  notes?: string;
  createdBy?: string | null;
}): number {
  return withDatabaseTransaction(() => {
    if (input.sourceLocationId === input.destinationLocationId) {
      throw new Error('Source and destination locations must differ.');
    }
    const lot = queryOne<FgLot>('SELECT * FROM fg_lots WHERE id = ?', [input.fgLotId]);
    if (!lot) throw new Error('Finished goods lot not found.');
    const balance = computeFgLotBalance(input.fgLotId, input.sourceLocationId);
    if (balance < input.quantity) {
      throw new Error(`Insufficient quantity at source location (${balance} available).`);
    }

    const groupId = nextFgGroupId();
    const unitCost = lot.unit_cost_kyd;
    insertFgTransaction({
      transactionType: 'Transfer Out',
      fgLotId: input.fgLotId,
      skuId: lot.sku_id,
      sourceLocationId: input.sourceLocationId,
      quantity: input.quantity,
      transactionGroupId: groupId,
      unitCostKyd: unitCost,
      notes: input.notes ?? '',
      createdBy: input.createdBy ?? null,
    });
    return insertFgTransaction({
      transactionType: 'Transfer In',
      fgLotId: input.fgLotId,
      skuId: lot.sku_id,
      destinationLocationId: input.destinationLocationId,
      quantity: input.quantity,
      transactionGroupId: groupId,
      unitCostKyd: unitCost,
      notes: input.notes ?? '',
      createdBy: input.createdBy ?? null,
    });
  });
}

export function reverseFgTransaction(transactionId: number, createdBy?: string | null): number {
  return withDatabaseTransaction(() => {
    const original = queryOne<FgTransaction>('SELECT * FROM fg_transactions WHERE id = ?', [transactionId]);
    if (!original) throw new Error('Transaction not found.');
    if (original.reversal_of_transaction_id) {
      throw new Error('Cannot reverse a reversal transaction.');
    }
    if (isFgTransactionReversed(original.id)) {
      throw new Error('Transaction has already been reversed.');
    }

    const code = nextBusinessCode('fgTransaction', 'fg_transactions', 'transaction_code');
    return insertRow(
      `INSERT INTO fg_transactions (
        transaction_code, transaction_type, transaction_timestamp, fg_lot_id, sku_id,
        source_location_id, destination_location_id, quantity, base_quantity, base_unit,
        transaction_group_id, reference_type, reference_id, unit_cost_kyd_snapshot,
        extended_cost_kyd, reason_code, notes, created_by, created_at, reversal_of_transaction_id
      ) VALUES (?, 'Reversal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        now(),
        original.fg_lot_id,
        original.sku_id,
        original.destination_location_id,
        original.source_location_id,
        original.quantity,
        original.quantity,
        original.base_unit,
        original.transaction_group_id,
        original.reference_type,
        original.reference_id,
        original.unit_cost_kyd_snapshot,
        original.extended_cost_kyd != null ? -original.extended_cost_kyd : null,
        'Measurement Correction',
        `Reversal of ${original.transaction_code}`,
        createdBy ?? null,
        now(),
        original.id,
      ],
    );
  });
}

export function postFgDamage(input: {
  fgLotId: number;
  locationId: number;
  quantity: number;
  reason: string;
  notes?: string;
  createdBy?: string | null;
}): number {
  const lot = queryOne<FgLot>('SELECT * FROM fg_lots WHERE id = ?', [input.fgLotId]);
  if (!lot) throw new Error('Finished goods lot not found.');
  const balance = computeFgLotBalance(input.fgLotId, input.locationId);
  if (balance < input.quantity) throw new Error('Insufficient quantity for damage posting.');
  return insertFgTransaction({
    transactionType: 'Damage',
    fgLotId: input.fgLotId,
    skuId: lot.sku_id,
    sourceLocationId: input.locationId,
    quantity: input.quantity,
    unitCostKyd: lot.unit_cost_kyd,
    reasonCode: input.reason,
    notes: input.notes ?? input.reason,
    createdBy: input.createdBy ?? null,
  });
}

export function postFgWriteOff(input: {
  fgLotId: number;
  locationId: number;
  quantity: number;
  reason: string;
  createdBy?: string | null;
}): number {
  const lot = queryOne<FgLot>('SELECT * FROM fg_lots WHERE id = ?', [input.fgLotId]);
  if (!lot) throw new Error('Finished goods lot not found.');
  return insertFgTransaction({
    transactionType: 'Write-Off',
    fgLotId: input.fgLotId,
    skuId: lot.sku_id,
    sourceLocationId: input.locationId,
    quantity: input.quantity,
    unitCostKyd: lot.unit_cost_kyd,
    reasonCode: input.reason,
    notes: input.reason,
    createdBy: input.createdBy ?? null,
  });
}

export function postFgCycleCountAdjustment(input: {
  fgLotId: number;
  locationId: number;
  varianceQuantity: number;
  notes?: string;
  createdBy?: string | null;
}): number {
  const lot = queryOne<FgLot>('SELECT * FROM fg_lots WHERE id = ?', [input.fgLotId]);
  if (!lot) throw new Error('Finished goods lot not found.');
  if (Math.abs(input.varianceQuantity) < 1e-9) {
    throw new Error('No variance to post.');
  }
  const isIncrease = input.varianceQuantity > 0;
  const absQty = Math.abs(input.varianceQuantity);
  if (!isIncrease) {
    const balance = computeFgLotBalance(input.fgLotId, input.locationId);
    if (balance < absQty) throw new Error('Insufficient quantity for cycle count decrease.');
  }
  return insertFgTransaction({
    transactionType: 'Reconciliation',
    fgLotId: input.fgLotId,
    skuId: lot.sku_id,
    sourceLocationId: isIncrease ? null : input.locationId,
    destinationLocationId: isIncrease ? input.locationId : null,
    quantity: absQty,
    unitCostKyd: lot.unit_cost_kyd,
    reasonCode: 'Cycle Count',
    notes: input.notes ?? 'Cycle count reconciliation',
    createdBy: input.createdBy ?? null,
  });
}

export function postFgReturn(input: {
  fgLotId: number;
  destinationLocationId: number;
  quantity: number;
  unitCostKyd?: number | null;
  referenceType?: string | null;
  referenceId?: number | null;
  notes?: string;
  createdBy?: string | null;
}): number {
  const lot = queryOne<FgLot>('SELECT * FROM fg_lots WHERE id = ?', [input.fgLotId]);
  if (!lot) throw new Error('Finished goods lot not found.');
  assertLedgerLocation(input.destinationLocationId);
  return insertFgTransaction({
    transactionType: 'Return',
    fgLotId: input.fgLotId,
    skuId: lot.sku_id,
    destinationLocationId: input.destinationLocationId,
    quantity: input.quantity,
    referenceType: input.referenceType ?? 'sales_return',
    referenceId: input.referenceId ?? null,
    unitCostKyd: input.unitCostKyd ?? lot.unit_cost_kyd,
    notes: input.notes ?? 'FG return to stock',
    createdBy: input.createdBy ?? null,
  });
}

export function postFgShipment(input: {
  fgLotId: number;
  sourceLocationId: number;
  quantity: number;
  referenceType?: string | null;
  referenceId?: number | null;
  notes?: string;
  createdBy?: string | null;
}): number {
  return withDatabaseTransaction(() => {
    const lot = queryOne<FgLot>('SELECT * FROM fg_lots WHERE id = ?', [input.fgLotId]);
    if (!lot) throw new Error('Finished goods lot not found.');
    assertEntityNotOnHold('fg_lot', input.fgLotId, `shipment for FG lot ${lot.fg_lot_code}`);
    const balance = computeFgLotBalance(input.fgLotId, input.sourceLocationId);
    if (balance < input.quantity) {
      throw new Error(`Insufficient quantity for shipment (${balance} available).`);
    }
    return insertFgTransaction({
      transactionType: 'Shipment',
      fgLotId: input.fgLotId,
      skuId: lot.sku_id,
      sourceLocationId: input.sourceLocationId,
      quantity: input.quantity,
      referenceType: input.referenceType ?? 'shipment',
      referenceId: input.referenceId ?? null,
      unitCostKyd: lot.unit_cost_kyd,
      notes: input.notes ?? 'FG shipment',
      createdBy: input.createdBy ?? null,
    });
  });
}

export function listFgInventory(): FgInventoryRow[] {
  const lots = queryAll<{
    id: number;
    fg_lot_code: string;
    printed_lot_code: string | null;
    sku_id: number;
    sku_code: string;
    sku_name: string;
    unit_cost_kyd: number | null;
    cost_status: string;
    status: string;
    production_date: string;
  }>(
    `SELECT fl.id, fl.fg_lot_code, fl.printed_lot_code, fl.sku_id, s.sku_code, s.name AS sku_name,
            fl.unit_cost_kyd, fl.cost_status, fl.status, fl.production_date
     FROM fg_lots fl
     JOIN md_skus s ON s.id = fl.sku_id
     ORDER BY fl.created_at DESC`,
  );

  const rows: FgInventoryRow[] = [];
  for (const lot of lots) {
    const locations = queryAll<{ location_id: number | null; location_name: string | null; qty: number }>(
      `SELECT destination_location_id AS location_id, l.name AS location_name,
              SUM(base_quantity) AS qty
       FROM fg_transactions t
       LEFT JOIN md_storage_locations l ON l.id = t.destination_location_id
       WHERE t.fg_lot_id = ?
         AND t.destination_location_id IS NOT NULL
         AND t.reversal_of_transaction_id IS NULL
         AND t.id NOT IN (SELECT reversal_of_transaction_id FROM fg_transactions WHERE reversal_of_transaction_id IS NOT NULL)
       GROUP BY destination_location_id
       HAVING qty > 0.000001`,
      [lot.id],
    );

    const outQty = queryOne<{ qty: number }>(
      `SELECT COALESCE(SUM(base_quantity), 0) AS qty FROM fg_transactions
       WHERE fg_lot_id = ? AND source_location_id IS NOT NULL
         AND reversal_of_transaction_id IS NULL
         AND id NOT IN (SELECT reversal_of_transaction_id FROM fg_transactions WHERE reversal_of_transaction_id IS NOT NULL)`,
      [lot.id],
    )?.qty ?? 0;

    if (locations.length === 0) {
      const netQty = computeFgLotBalance(lot.id);
      if (netQty > 0) {
        rows.push({
          fg_lot_id: lot.id,
          fg_lot_code: lot.fg_lot_code,
          printed_lot_code: lot.printed_lot_code,
          sku_id: lot.sku_id,
          sku_code: lot.sku_code,
          sku_name: lot.sku_name,
          location_id: null,
          location_name: null,
          quantity: netQty,
          unit_cost_kyd: lot.unit_cost_kyd,
          extended_cost_kyd: lot.unit_cost_kyd != null ? lot.unit_cost_kyd * netQty : null,
          cost_status: lot.cost_status,
          status: lot.status,
          production_date: lot.production_date,
        });
      }
      continue;
    }

    for (const loc of locations) {
      const qty = computeFgLotBalance(lot.id, loc.location_id);
      if (qty <= 0) continue;
      rows.push({
        fg_lot_id: lot.id,
        fg_lot_code: lot.fg_lot_code,
        printed_lot_code: lot.printed_lot_code,
        sku_id: lot.sku_id,
        sku_code: lot.sku_code,
        sku_name: lot.sku_name,
        location_id: loc.location_id,
        location_name: loc.location_name,
        quantity: qty,
        unit_cost_kyd: lot.unit_cost_kyd,
        extended_cost_kyd: lot.unit_cost_kyd != null ? lot.unit_cost_kyd * qty : null,
        cost_status: lot.cost_status,
        status: lot.status,
        production_date: lot.production_date,
      });
    }
    void outQty;
  }
  return rows;
}

export function getFgLot(lotId: number): FgLot | null {
  return queryOne<FgLot>('SELECT * FROM fg_lots WHERE id = ?', [lotId]);
}

export function listFgLots(): FgLot[] {
  return queryAll<FgLot>('SELECT * FROM fg_lots ORDER BY created_at DESC');
}

export function listFgTransactions(fgLotId?: number): FgTransaction[] {
  if (fgLotId != null) {
    return queryAll<FgTransaction>(
      'SELECT * FROM fg_transactions WHERE fg_lot_id = ? ORDER BY transaction_timestamp DESC, id DESC',
      [fgLotId],
    );
  }
  return queryAll<FgTransaction>('SELECT * FROM fg_transactions ORDER BY transaction_timestamp DESC LIMIT 500');
}

export function getFgDashboardSummary(): {
  totalLots: number;
  totalUnits: number;
  valuedInventoryKyd: number | null;
  openRuns: number;
} {
  const totalLots = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM fg_lots')?.count ?? 0;
  const inventory = listFgInventory();
  const totalUnits = inventory.reduce((s, r) => s + r.quantity, 0);
  const valued = inventory.filter((r) => r.cost_status === 'VALUED');
  const valuedInventoryKyd =
    valued.length > 0 ? valued.reduce((s, r) => s + (r.extended_cost_kyd ?? 0), 0) : null;
  const openRuns =
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM pkg_runs WHERE status NOT IN ('Completed', 'Cancelled')`,
    )?.count ?? 0;
  return { totalLots, totalUnits, valuedInventoryKyd, openRuns };
}

