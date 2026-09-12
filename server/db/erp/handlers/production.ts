import type pg from 'pg';
import { computeLpa } from '../../../../shared/liquid-ledger/balance.js';
import { SOURCE_DOCUMENT_TYPES } from '../../../../shared/production-orders/constants.js';
import { resolveOutputLpa } from '../../../../shared/production-orders/output-validation.js';
import { validatePositiveVolume } from '../../../../shared/liquid-ledger/validation.js';
import { validateSufficientMaterialBalance } from '../../../../shared/material-inventory/validation.js';
import { computeLiquidLotVolume, computeMaterialLotBalance } from '../balance-engine.js';
import {
  insertRow,
  nextBusinessCode,
  queryAll,
  queryOne,
  runQuery,
  withPgTransaction,
} from '../pg-helpers.js';
import { createBlend, postProcessLoss, proofDown } from './liquid-operations.js';
import { postMaterialTransaction } from './material.js';
import type { MaterialType } from '../../../../shared/material-inventory/constants.js';

const now = () => new Date().toISOString();

function computeActualLpa(volume: number, abv: number): number {
  return computeLpa(volume, abv);
}

async function insertEvent(
  client: pg.PoolClient,
  eventType: string,
  message: string,
  productionOrderId?: number | null,
  batchId?: number | null,
  userId?: string | null,
): Promise<void> {
  await insertRow(
    `INSERT INTO prod_events (production_order_id, batch_id, event_type, message, user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [productionOrderId ?? null, batchId ?? null, eventType, message, userId ?? null, now()],
    client,
  );
}

export async function listProductionOrders(status?: string) {
  const sql = `
    SELECT o.*, p.name AS product_name, r.name AS recipe_name, r.recipe_code,
           v.version_number, v.version_label
    FROM prod_orders o
    JOIN md_products p ON p.id = o.product_id
    JOIN rc_recipes r ON r.id = o.recipe_id
    JOIN rc_recipe_versions v ON v.id = o.recipe_version_id
    ${status ? 'WHERE o.status = $1' : ''}
    ORDER BY o.order_code DESC`;
  return queryAll(sql, status ? [status] : []);
}

export async function listProductionBatches(orderId?: number) {
  const sql = orderId
    ? 'SELECT * FROM prod_batches WHERE production_order_id = $1 ORDER BY batch_number'
    : 'SELECT * FROM prod_batches ORDER BY created_at DESC LIMIT 500';
  return queryAll(sql, orderId != null ? [orderId] : []);
}

export async function recordBatchInput(input: {
  batchId: number;
  requirementId?: number | null;
  inputType: string;
  rawMaterialId?: number | null;
  bulkSpiritId?: number | null;
  liquidLotId?: number | null;
  sourceTankId?: number | null;
  packagingMaterialId?: number | null;
  materialLotId?: number | null;
  sourceLocationId?: number | null;
  actualQuantity: number;
  unit: string;
  actualVolumeLitres?: number | null;
  actualAbv?: number | null;
  notes?: string;
}): Promise<number> {
  return withPgTransaction(async (client) => {
    const batch = await queryOne<{ id: number; status: string; production_order_id: number }>(
      'SELECT id, status, production_order_id FROM prod_batches WHERE id = $1',
      [input.batchId],
      client,
    );
    if (!batch) throw new Error('Batch not found.');
    if (!['In Progress', 'Paused'].includes(batch.status)) {
      throw new Error('Inputs can only be recorded on In Progress or Paused batches.');
    }

    if (input.inputType === 'Liquid Lot') {
      if (input.sourceTankId == null || input.liquidLotId == null) {
        throw new Error('Liquid lot input requires source tank and lot.');
      }
      const tank = await queryOne<{ tracking_mode: string }>(
        'SELECT tracking_mode FROM liq_tanks WHERE id = $1',
        [input.sourceTankId],
        client,
      );
      if (!tank || tank.tracking_mode !== 'LEDGER') {
        throw new Error('Source tank must be LEDGER-managed.');
      }
      const vol = input.actualVolumeLitres ?? input.actualQuantity;
      validatePositiveVolume(vol, 'Liquid volume');
      const lotBal = await computeLiquidLotVolume(input.liquidLotId);
      if (lotBal.volumeLitres < vol) {
        throw new Error(`Insufficient lot volume: ${lotBal.volumeLitres} L available.`);
      }
    }

    let baseQuantity: number | null = null;
    let baseUnit: string | null = null;
    if (input.inputType === 'Raw Material' || input.inputType === 'Packaging') {
      const materialType: MaterialType =
        input.inputType === 'Raw Material' ? 'RAW_MATERIAL' : 'PACKAGING_MATERIAL';
      const rawId = input.rawMaterialId ?? null;
      const pkgId = input.packagingMaterialId ?? null;
      if (input.inputType === 'Raw Material' && rawId != null) {
        const mode = await queryOne<{ inventory_tracking_mode: string }>(
          'SELECT inventory_tracking_mode FROM md_raw_materials WHERE id = $1',
          [rawId],
          client,
        );
        if (mode?.inventory_tracking_mode === 'LEDGER') {
          if (input.materialLotId == null || input.sourceLocationId == null) {
            throw new Error('LEDGER-managed material input requires material lot and source location.');
          }
          baseQuantity = input.actualQuantity;
          baseUnit = input.unit;
          const avail = await computeMaterialLotBalance(input.materialLotId, input.sourceLocationId);
          validateSufficientMaterialBalance(avail, baseQuantity, 'material lot at location');
        }
      }
      if (input.inputType === 'Packaging' && pkgId != null) {
        const mode = await queryOne<{ inventory_tracking_mode: string }>(
          'SELECT inventory_tracking_mode FROM md_packaging_materials WHERE id = $1',
          [pkgId],
          client,
        );
        if (mode?.inventory_tracking_mode === 'LEDGER') {
          if (input.materialLotId == null || input.sourceLocationId == null) {
            throw new Error('LEDGER-managed material input requires material lot and source location.');
          }
          baseQuantity = input.actualQuantity;
          baseUnit = input.unit;
          const avail = await computeMaterialLotBalance(input.materialLotId, input.sourceLocationId);
          validateSufficientMaterialBalance(avail, baseQuantity, 'material lot at location');
        }
      }
      void materialType;
    }

    const lpa = computeActualLpa(
      input.actualVolumeLitres ?? input.actualQuantity,
      input.actualAbv ?? 0,
    );

    const inputId = await insertRow(
      `INSERT INTO prod_batch_inputs (
        batch_id, requirement_id, input_type, raw_material_id, bulk_spirit_id, liquid_lot_id,
        source_tank_id, packaging_material_id, material_lot_id, source_location_id,
        actual_quantity, unit, actual_volume_litres, actual_abv, actual_lpa,
        base_quantity, base_unit, material_transaction_id, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NULL, $18, $19)`,
      [
        input.batchId,
        input.requirementId ?? null,
        input.inputType,
        input.rawMaterialId ?? null,
        input.bulkSpiritId ?? null,
        input.liquidLotId ?? null,
        input.sourceTankId ?? null,
        input.packagingMaterialId ?? null,
        input.materialLotId ?? null,
        input.sourceLocationId ?? null,
        input.actualQuantity,
        input.unit,
        input.actualVolumeLitres ??
          (['Water', 'Liquid Lot', 'Bulk Spirit'].includes(input.inputType)
            ? input.actualQuantity
            : null),
        input.inputType === 'Water' ? 0 : (input.actualAbv ?? null),
        lpa,
        baseQuantity,
        baseUnit,
        input.notes ?? '',
        now(),
      ],
      client,
    );

    await insertEvent(
      client,
      'Input Recorded',
      `${input.inputType} input recorded`,
      batch.production_order_id,
      input.batchId,
    );
    return inputId;
  });
}

async function getLiquidInputs(client: pg.PoolClient, batchId: number) {
  return queryAll<{
    id: number;
    liquid_lot_id: number | null;
    source_tank_id: number | null;
    actual_volume_litres: number | null;
    actual_quantity: number;
    actual_abv: number | null;
    actual_lpa: number | null;
    input_type: string;
    raw_material_id: number | null;
    packaging_material_id: number | null;
    material_lot_id: number | null;
    source_location_id: number | null;
    base_quantity: number | null;
    unit: string;
    base_unit: string | null;
  }>(
    `SELECT * FROM prod_batch_inputs WHERE batch_id = $1 AND input_type IN ('Liquid Lot', 'Bulk Spirit')`,
    [batchId],
    client,
  );
}

async function getWaterInputs(client: pg.PoolClient, batchId: number) {
  return queryAll<{ actual_volume_litres: number | null; actual_quantity: number }>(
    `SELECT actual_volume_litres, actual_quantity FROM prod_batch_inputs WHERE batch_id = $1 AND input_type = 'Water'`,
    [batchId],
    client,
  );
}

async function getMaterialInputs(client: pg.PoolClient, batchId: number) {
  return queryAll<{
    id: number;
    input_type: string;
    raw_material_id: number | null;
    packaging_material_id: number | null;
    material_lot_id: number | null;
    source_location_id: number | null;
    actual_quantity: number;
    base_quantity: number | null;
    unit: string;
    base_unit: string | null;
    material_transaction_id: number | null;
  }>(
    `SELECT * FROM prod_batch_inputs WHERE batch_id = $1 AND input_type IN ('Raw Material', 'Packaging')`,
    [batchId],
    client,
  );
}

async function isLedgerMaterialInput(client: pg.PoolClient, input: {
  input_type: string;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  material_lot_id: number | null;
  source_location_id: number | null;
  material_transaction_id: number | null;
}): Promise<boolean> {
  if (input.material_transaction_id != null) return false;
  if (input.material_lot_id == null || input.source_location_id == null) return false;
  if (input.input_type === 'Raw Material') {
    const mode = await queryOne<{ inventory_tracking_mode: string }>(
      'SELECT inventory_tracking_mode FROM md_raw_materials WHERE id = $1',
      [input.raw_material_id],
      client,
    );
    return mode?.inventory_tracking_mode === 'LEDGER';
  }
  if (input.input_type === 'Packaging') {
    const mode = await queryOne<{ inventory_tracking_mode: string }>(
      'SELECT inventory_tracking_mode FROM md_packaging_materials WHERE id = $1',
      [input.packaging_material_id],
      client,
    );
    return mode?.inventory_tracking_mode === 'LEDGER';
  }
  return false;
}

async function postPendingMaterialIssues(
  client: pg.PoolClient,
  batchId: number,
  orderId: number,
  groupId: string,
  operatorId?: string | null,
): Promise<void> {
  for (const input of await getMaterialInputs(client, batchId)) {
    if (!(await isLedgerMaterialInput(client, input))) continue;
    const materialType: MaterialType =
      input.input_type === 'Raw Material' ? 'RAW_MATERIAL' : 'PACKAGING_MATERIAL';
    const baseQty = input.base_quantity ?? input.actual_quantity;
    const baseUnit = input.base_unit ?? input.unit;
    const txId = await postMaterialTransaction({
      transactionType: 'Production Issue',
      materialType,
      rawMaterialId: input.raw_material_id,
      packagingMaterialId: input.packaging_material_id,
      materialLotId: input.material_lot_id!,
      sourceLocationId: input.source_location_id!,
      quantity: input.actual_quantity,
      unit: input.unit,
      baseQuantity: baseQty,
      baseUnit,
      productionOrderId: orderId,
      productionBatchId: batchId,
      transactionGroupId: groupId,
      createdBy: operatorId,
    });
    await runQuery('UPDATE prod_batch_inputs SET material_transaction_id = $1 WHERE id = $2', [txId, input.id], client);
  }
}

async function postPendingBatchLosses(
  client: pg.PoolClient,
  batchId: number,
  groupId: string,
  operatorId?: string | null,
): Promise<void> {
  const losses = await queryAll<{
    id: number;
    tank_id: number | null;
    liquid_lot_id: number | null;
    volume_litres: number | null;
    abv: number | null;
    loss_type: string;
    reason: string;
  }>(
    `SELECT id, tank_id, liquid_lot_id, volume_litres, abv, loss_type, reason
     FROM prod_batch_losses WHERE batch_id = $1 AND transaction_id IS NULL
     AND volume_litres IS NOT NULL AND volume_litres > 0 AND tank_id IS NOT NULL`,
    [batchId],
    client,
  );
  for (const loss of losses) {
    const txId = await postProcessLoss(client, {
      tankId: loss.tank_id!,
      lotId: loss.liquid_lot_id,
      volumeLitres: loss.volume_litres!,
      abv: loss.abv ?? 0,
      lossType: loss.loss_type,
      reason: loss.reason,
      sourceDocumentType: SOURCE_DOCUMENT_TYPES.PRODUCTION_BATCH,
      sourceDocumentId: batchId,
      transactionGroupId: groupId,
      createdBy: operatorId,
    });
    await runQuery('UPDATE prod_batch_losses SET transaction_id = $1 WHERE id = $2', [txId, loss.id], client);
  }
}

export async function completeBatch(input: {
  batchId: number;
  destinationTankId: number;
  actualOutputLitres: number;
  actualOutputAbv: number;
  outputLotType?: string;
  outputDescription?: string;
  actualBrix?: number | null;
  actualPh?: number | null;
  actualCarbonationVolumes?: number | null;
  notes?: string;
  operatorId?: string | null;
}): Promise<{ lotId: number; transactionIds: number[] }> {
  return withPgTransaction(async (client) => {
    const batch = await queryOne<{
      id: number;
      status: string;
      batch_code: string;
      production_order_id: number;
      transaction_group_id: string | null;
    }>('SELECT * FROM prod_batches WHERE id = $1', [input.batchId], client);
    if (!batch) throw new Error('Batch not found.');
    if (batch.status === 'Completed') throw new Error('Batch is already completed.');
    if (batch.status !== 'In Progress') throw new Error('Only In Progress batches can be completed.');

    const order = await queryOne<{
      id: number;
      order_code: string;
      production_type: string;
      product_id: number;
      recipe_version_id: number;
      snapshot_target_abv: number | null;
    }>('SELECT * FROM prod_orders WHERE id = $1', [batch.production_order_id], client);
    if (!order) throw new Error('Production order not found.');

    validatePositiveVolume(input.actualOutputLitres, 'Output volume');
    const outputLpa = resolveOutputLpa(input.actualOutputLitres, input.actualOutputAbv);

    const destTank = await queryOne<{ tracking_mode: string; capacity_litres: number }>(
      'SELECT tracking_mode, capacity_litres FROM liq_tanks WHERE id = $1',
      [input.destinationTankId],
      client,
    );
    if (!destTank || destTank.tracking_mode !== 'LEDGER') {
      throw new Error('Destination tank must be LEDGER-managed.');
    }

    const groupId =
      batch.transaction_group_id ??
      (await nextBusinessCode('operationGroup', 'liq_transactions', 'transaction_group_id', 4, client));
    const materialGroupId = await nextBusinessCode(
      'materialOperationGroup',
      'mat_transactions',
      'transaction_group_id',
      4,
      client,
    );
    const docType = SOURCE_DOCUMENT_TYPES.PRODUCTION_BATCH;
    const docId = batch.id;

    await postPendingMaterialIssues(client, batch.id, order.id, materialGroupId, input.operatorId);
    await postPendingBatchLosses(client, batch.id, groupId, input.operatorId);

    const productionType = order.production_type;
    const liquidInputs = await getLiquidInputs(client, batch.id);
    let lotId = 0;
    let transactionIds: number[] = [];

    if (productionType === 'Blending') {
      if (liquidInputs.length < 2) throw new Error('Blend requires at least two liquid inputs.');
      const sourceTankId = liquidInputs[0]?.source_tank_id;
      if (sourceTankId == null) throw new Error('Blend requires a source tank.');
      const result = await createBlend(client, {
        sourceTankId,
        destinationTankId: input.destinationTankId,
        consumptions: liquidInputs.map((li) => ({
          lotId: li.liquid_lot_id!,
          volumeLitres: li.actual_volume_litres ?? li.actual_quantity,
        })),
        outputLotType: input.outputLotType ?? 'Blend',
        outputDescription: input.outputDescription ?? `Production batch ${batch.batch_code}`,
        productId: order.product_id,
        recipeVersionId: order.recipe_version_id,
        sourceDocumentType: docType,
        sourceDocumentId: docId,
        transactionGroupId: groupId,
        notes: input.notes,
        createdBy: input.operatorId,
      });
      lotId = result.lotId;
      transactionIds = result.transactionIds;
    } else if (productionType === 'Proof Down' || productionType.includes('Proof')) {
      const spiritInput = liquidInputs[0];
      const waterInput = (await getWaterInputs(client, batch.id))[0];
      if (!spiritInput || !waterInput) throw new Error('Proof-down requires spirit and water inputs.');
      const result = await proofDown(client, {
        sourceTankId: spiritInput.source_tank_id!,
        sourceLotId: spiritInput.liquid_lot_id!,
        sourceVolumeLitres: spiritInput.actual_volume_litres ?? spiritInput.actual_quantity,
        sourceAbv: spiritInput.actual_abv ?? order.snapshot_target_abv ?? 96,
        waterVolumeLitres: waterInput.actual_volume_litres ?? waterInput.actual_quantity,
        targetAbv: order.snapshot_target_abv ?? input.actualOutputAbv,
        actualOutputVolumeLitres: input.actualOutputLitres,
        actualOutputAbv: input.actualOutputAbv,
        destinationTankId: input.destinationTankId,
        productId: order.product_id,
        recipeVersionId: order.recipe_version_id,
        sourceDocumentType: docType,
        sourceDocumentId: docId,
        transactionGroupId: groupId,
        notes: input.notes,
        createdBy: input.operatorId,
      });
      lotId = result.lotId;
      transactionIds = result.transactionIds;
    } else {
      throw new Error(
        `Batch completion for production type "${productionType}" requires Proof Down or Blending.`,
      );
    }

    const ts = now();
    await runQuery(
      `UPDATE prod_batches SET
        status = 'Completed', completed_at = $1, destination_tank_id = $2, output_lot_id = $3,
        actual_output_litres = $4, actual_output_abv = $5, actual_output_lpa = $6,
        actual_brix = $7, actual_ph = $8, actual_carbonation_volumes = $9,
        transaction_group_id = $10, operator_id = COALESCE($11, operator_id), updated_at = $1
       WHERE id = $12`,
      [
        ts,
        input.destinationTankId,
        lotId,
        input.actualOutputLitres,
        input.actualOutputAbv,
        outputLpa,
        input.actualBrix ?? null,
        input.actualPh ?? null,
        input.actualCarbonationVolumes ?? null,
        groupId,
        input.operatorId ?? null,
        batch.id,
      ],
      client,
    );

    await runQuery('UPDATE prod_batch_inputs SET transaction_group_id = $1 WHERE batch_id = $2', [groupId, batch.id], client);
    await insertEvent(
      client,
      'Batch Completed',
      `Batch ${batch.batch_code} completed`,
      order.id,
      batch.id,
      input.operatorId,
    );

    const openBatches = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prod_batches
       WHERE production_order_id = $1 AND status NOT IN ('Completed', 'Cancelled')`,
      [order.id],
      client,
    );
    if (Number(openBatches?.count ?? 0) === 0) {
      await runQuery(
        `UPDATE prod_orders SET status = 'Completed', completed_at = $1, updated_at = $1 WHERE id = $2`,
        [ts, order.id],
        client,
      );
      await insertEvent(client, 'Order Completed', `Order ${order.order_code} completed`, order.id);
    }

    return { lotId, transactionIds };
  });
}
