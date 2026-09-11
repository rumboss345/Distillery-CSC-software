import { computeLpa } from '../../shared/liquid-ledger/balance';
import { SOURCE_DOCUMENT_TYPES } from '../../shared/production-orders/constants';
import {
  assertBatchStatusTransition,
  assertOrderStatusTransition,
  isOrderEditable,
} from '../../shared/production-orders/status-transitions';
import {
  ingredientVariancePercent,
  quantityVariance,
  type PlannedVsActualLine,
} from '../../shared/production-orders/yield';
import {
  validateLossReason,
  validatePlannedBatchSize,
} from '../../shared/production-orders/validation';
import { formatBusinessCode, codePrefixForEntity } from '../../shared/master-data/codes';
import { recipeScaleFactor } from '../../shared/recipes/scaling';
import { validatePositiveVolume } from '../../shared/liquid-ledger/validation';
import type {
  CompleteBatchInput,
  CreateProductionOrderInput,
  ProdBatch,
  ProdBatchInput,
  ProdBatchStep,
  ProdEvent,
  ProdOrder,
  ProdOrderRequirement,
  ProductionProgress,
  RecordBatchInputData,
  RecordBatchLossInput,
  UpdateDraftOrderInput,
} from '../types/production-orders';
import type { LiqTransaction } from '../types/liquid-ledger';
import {
  insertRow,
  queryAll,
  queryOne,
  runQuery,
  withDatabaseTransaction,
} from './database';
import {
  createBlend,
  getLotBalance,
  getTank,
  postProcessLoss,
  proofDown,
} from './liquid-ledger-queries';
import { nextBusinessCode } from './master-data-queries';
import {
  getRecipe,
  getRecipeIngredients,
  getRecipePackaging,
  getRecipeSteps,
  getRecipeVersion,
} from './recipes-queries';
import {
  PRODUCTION_LOOKUP_TYPES,
  PRODUCTION_TYPES,
} from '../../shared/production-orders/constants';
import { addLookupValue, getLookupNames } from './master-data-queries';

const now = () => new Date().toISOString();

function insertEvent(
  eventType: string,
  message: string,
  productionOrderId?: number | null,
  batchId?: number | null,
  userId?: string | null,
): void {
  insertRow(
    `INSERT INTO prod_events (production_order_id, batch_id, event_type, message, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [productionOrderId ?? null, batchId ?? null, eventType, message, userId ?? null, now()],
  );
}

export function seedProductionLookupsIfEmpty(): void {
  for (const name of PRODUCTION_TYPES) {
    const existing = queryOne<{ id: number }>(
      'SELECT id FROM md_lookup_values WHERE lookup_type = ? AND name = ? COLLATE NOCASE',
      [PRODUCTION_LOOKUP_TYPES.PRODUCTION_TYPE, name],
    );
    if (!existing) addLookupValue(PRODUCTION_LOOKUP_TYPES.PRODUCTION_TYPE, name);
  }
}

export function listOrders(status?: string): ProdOrder[] {
  return queryAll<ProdOrder>(
    `SELECT o.*, p.name AS product_name, r.name AS recipe_name, r.recipe_code,
            v.version_number, v.version_label
     FROM prod_orders o
     JOIN md_products p ON p.id = o.product_id
     JOIN rc_recipes r ON r.id = o.recipe_id
     JOIN rc_recipe_versions v ON v.id = o.recipe_version_id
     ${status ? 'WHERE o.status = ?' : ''}
     ORDER BY o.order_code DESC`,
    status ? [status] : [],
  );
}

export function getOrder(id: number): ProdOrder | null {
  return queryOne<ProdOrder>(
    `SELECT o.*, p.name AS product_name, r.name AS recipe_name, r.recipe_code,
            v.version_number, v.version_label
     FROM prod_orders o
     JOIN md_products p ON p.id = o.product_id
     JOIN rc_recipes r ON r.id = o.recipe_id
     JOIN rc_recipe_versions v ON v.id = o.recipe_version_id
     WHERE o.id = ?`,
    [id],
  );
}

function buildPlannedRequirements(
  orderId: number,
  recipeVersionId: number,
  plannedBatchSize: number,
): void {
  const version = getRecipeVersion(recipeVersionId);
  if (!version) throw new Error('Recipe version not found.');
  const factor = recipeScaleFactor(version.target_batch_size, plannedBatchSize);

  const ingredients = getRecipeIngredients(recipeVersionId);
  for (const ing of ingredients) {
    const scales = ing.quantity_basis === 'Fixed Quantity' || ing.quantity_basis === 'Per Batch';
    const plannedQty = scales ? ing.quantity * factor : ing.quantity;
    const isLiquid = ing.ingredient_type === 'Bulk Spirit' || ing.ingredient_type === 'Water';
    const plannedVol = isLiquid && ing.unit === 'L' ? plannedQty : null;
    const plannedAbv = ing.ingredient_type === 'Bulk Spirit' ? (ing.bulk_spirit_abv ?? null) : (ing.ingredient_type === 'Water' ? 0 : null);
    const plannedLpa = plannedVol != null && plannedAbv != null ? computeLpa(plannedVol, plannedAbv) : null;

    insertRow(
      `INSERT INTO prod_order_requirements (
        production_order_id, requirement_type, raw_material_id, bulk_spirit_id, liquid_lot_id,
        packaging_material_id, sku_id, description, planned_quantity, unit,
        planned_volume_litres, planned_abv, planned_lpa, sequence, notes, recipe_ingredient_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        ing.ingredient_type === 'Water' ? 'Water' : ing.ingredient_type === 'Bulk Spirit' ? 'Bulk Spirit' : 'Raw Material',
        ing.raw_material_id,
        ing.bulk_spirit_id,
        ing.source_lot_id,
        null,
        null,
        ing.material_name ?? ing.description ?? ing.ingredient_type,
        plannedQty,
        ing.unit,
        plannedVol,
        plannedAbv,
        plannedLpa,
        ing.sequence,
        ing.notes,
        ing.id,
      ],
    );
  }

  const packaging = getRecipePackaging(recipeVersionId);
  for (const pkg of packaging) {
    const scales = pkg.quantity_basis === 'Fixed Quantity' || pkg.quantity_basis === 'Per Batch';
    const plannedQty = scales ? pkg.quantity * factor : pkg.quantity;
    insertRow(
      `INSERT INTO prod_order_requirements (
        production_order_id, requirement_type, packaging_material_id, sku_id, description,
        planned_quantity, unit, sequence, notes, recipe_packaging_id
      ) VALUES (?, 'Packaging', ?, ?, ?, ?, 'each', ?, ?, ?)`,
      [
        orderId,
        pkg.packaging_material_id,
        pkg.sku_id,
        pkg.packaging_name ?? 'Packaging',
        plannedQty,
        0,
        pkg.notes ?? '',
        pkg.id,
      ],
    );
  }
}

export function createOrder(input: CreateProductionOrderInput): number {
  validatePlannedBatchSize(input.plannedBatchSize);
  const recipe = getRecipe(input.recipeId);
  if (!recipe) throw new Error('Recipe not found.');
  const version = getRecipeVersion(input.recipeVersionId);
  if (!version || version.recipe_id !== input.recipeId) {
    throw new Error('Recipe version does not belong to the selected recipe.');
  }
  if (recipe.product_id !== input.productId) {
    throw new Error('Product does not match recipe.');
  }

  const productionType = input.productionType ?? recipe.recipe_type;
  const code = nextBusinessCode('productionOrder', 'prod_orders', 'order_code');
  const ts = now();
  const plannedOutput = input.plannedOutputLitres ?? input.plannedBatchSize;
  const plannedAbv = input.plannedAbv ?? version.target_abv;

  return withDatabaseTransaction(() => {
    const orderId = insertRow(
      `INSERT INTO prod_orders (
        order_code, product_id, recipe_id, recipe_version_id, sku_id, production_type,
        planned_batch_size, batch_size_unit, planned_output_litres, planned_abv,
        scheduled_date, due_date, priority, status, assigned_to, location_id, notes,
        created_by, created_at, updated_at,
        snapshot_target_abv, snapshot_expected_yield_percent, snapshot_target_brix,
        snapshot_target_ph, snapshot_target_carbonation_volumes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        input.productId,
        input.recipeId,
        input.recipeVersionId,
        input.skuId ?? null,
        productionType,
        input.plannedBatchSize,
        input.batchSizeUnit ?? version.batch_size_unit,
        plannedOutput,
        plannedAbv,
        input.scheduledDate ?? null,
        input.dueDate ?? null,
        input.priority ?? 'Normal',
        input.assignedTo ?? null,
        input.locationId ?? null,
        input.notes ?? '',
        input.createdBy ?? null,
        ts,
        ts,
        version.target_abv,
        version.expected_yield_percent,
        version.target_brix,
        version.target_ph,
        version.target_carbonation_volumes,
      ],
    );

    buildPlannedRequirements(orderId, input.recipeVersionId, input.plannedBatchSize);
    insertEvent('Order Created', `Production order ${code} created`, orderId, null, input.createdBy);
    return orderId;
  });
}

export function updateDraftOrder(input: UpdateDraftOrderInput): void {
  const order = getOrder(input.orderId);
  if (!order) throw new Error('Production order not found.');
  if (!isOrderEditable(order.status)) {
    throw new Error('Only Draft or Planned orders can be edited.');
  }

  withDatabaseTransaction(() => {
    const ts = now();
    if (input.plannedBatchSize != null && input.plannedBatchSize !== order.planned_batch_size) {
      validatePlannedBatchSize(input.plannedBatchSize);
      runQuery('DELETE FROM prod_order_requirements WHERE production_order_id = ?', [order.id]);
      buildPlannedRequirements(order.id, order.recipe_version_id, input.plannedBatchSize);
    }
    runQuery(
      `UPDATE prod_orders SET
        planned_batch_size = COALESCE(?, planned_batch_size),
        scheduled_date = COALESCE(?, scheduled_date),
        due_date = COALESCE(?, due_date),
        priority = COALESCE(?, priority),
        assigned_to = COALESCE(?, assigned_to),
        location_id = COALESCE(?, location_id),
        notes = COALESCE(?, notes),
        updated_at = ?
       WHERE id = ?`,
      [
        input.plannedBatchSize ?? null,
        input.scheduledDate ?? null,
        input.dueDate ?? null,
        input.priority ?? null,
        input.assignedTo ?? null,
        input.locationId ?? null,
        input.notes ?? null,
        ts,
        order.id,
      ],
    );
    insertEvent('Order Updated', `Production order ${order.order_code} updated`, order.id);
  });
}

function snapshotBatchSteps(batchId: number, recipeVersionId: number): void {
  const steps = getRecipeSteps(recipeVersionId);
  for (const step of steps) {
    insertRow(
      `INSERT INTO prod_batch_steps (batch_id, recipe_step_id, step_number, instruction_snapshot, status)
       VALUES (?, ?, ?, ?, 'Pending')`,
      [batchId, step.id, step.step_number, step.instruction],
    );
  }
}

export function createBatch(orderId: number): number {
  const order = getOrder(orderId);
  if (!order) throw new Error('Production order not found.');
  if (!['Released', 'In Progress'].includes(order.status)) {
    throw new Error('Batches can only be added to Released or In Progress orders.');
  }

  const seq = (queryOne<{ max_seq: number }>(
    'SELECT COALESCE(MAX(batch_sequence), 0) AS max_seq FROM prod_batches WHERE production_order_id = ?',
    [orderId],
  )?.max_seq ?? 0) + 1;
  const code = nextBusinessCode('productionBatch', 'prod_batches', 'batch_code');
  const ts = now();

  return withDatabaseTransaction(() => {
    const batchId = insertRow(
      `INSERT INTO prod_batches (batch_code, production_order_id, batch_sequence, status, created_at, updated_at)
       VALUES (?, ?, ?, 'Ready', ?, ?)`,
      [code, orderId, seq, ts, ts],
    );
    snapshotBatchSteps(batchId, order.recipe_version_id);
    insertEvent('Batch Created', `Batch ${code} created`, orderId, batchId);
    return batchId;
  });
}

export function planOrder(orderId: number, userId?: string | null): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Production order not found.');
  assertOrderStatusTransition(order.status, 'Planned');
  runQuery(
    `UPDATE prod_orders SET status = 'Planned', updated_at = ? WHERE id = ?`,
    [now(), orderId],
  );
  insertEvent('Order Updated', `Order ${order.order_code} planned`, orderId, null, userId);
}

export function releaseOrder(orderId: number, userId?: string | null): number {
  const order = getOrder(orderId);
  if (!order) throw new Error('Production order not found.');
  assertOrderStatusTransition(order.status, 'Released');

  const version = getRecipeVersion(order.recipe_version_id);
  if (!version) throw new Error('Locked recipe version not found.');
  if (order.planned_batch_size <= 0) throw new Error('Planned batch size is required.');

  const reqCount = queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM prod_order_requirements WHERE production_order_id = ?',
    [orderId],
  )?.count ?? 0;
  if (reqCount === 0) throw new Error('Production order has no planned requirements.');

  const ts = now();
  return withDatabaseTransaction(() => {
    runQuery(
      `UPDATE prod_orders SET status = 'Released', released_at = ?, updated_at = ? WHERE id = ?`,
      [ts, ts, orderId],
    );
    const batchId = insertRow(
      `INSERT INTO prod_batches (batch_code, production_order_id, batch_sequence, status, created_at, updated_at)
       VALUES (?, ?, 1, 'Ready', ?, ?)`,
      [nextBusinessCode('productionBatch', 'prod_batches', 'batch_code'), orderId, ts, ts],
    );
    snapshotBatchSteps(batchId, order.recipe_version_id);
    insertEvent('Order Released', `Order ${order.order_code} released`, orderId, batchId, userId);
    return batchId;
  });
}

export function cancelOrder(orderId: number, userId?: string | null): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Production order not found.');
  if (order.status === 'Completed' || order.status === 'Cancelled') {
    throw new Error('Order cannot be cancelled.');
  }
  const postedBatches = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM prod_batches
     WHERE production_order_id = ? AND transaction_group_id IS NOT NULL`,
    [orderId],
  )?.count ?? 0;
  if (postedBatches > 0) {
    throw new Error('Cannot cancel order with posted liquid ledger transactions. Use reversal workflow.');
  }

  assertOrderStatusTransition(order.status, 'Cancelled');
  const ts = now();
  runQuery(
    `UPDATE prod_orders SET status = 'Cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, orderId],
  );
  insertEvent('Order Cancelled', `Order ${order.order_code} cancelled`, orderId, null, userId);
}

export function getRequirements(orderId: number): ProdOrderRequirement[] {
  return queryAll<ProdOrderRequirement>(
    'SELECT * FROM prod_order_requirements WHERE production_order_id = ? ORDER BY sequence, id',
    [orderId],
  );
}

export function getBatches(orderId: number): ProdBatch[] {
  return queryAll<ProdBatch>(
    'SELECT * FROM prod_batches WHERE production_order_id = ? ORDER BY batch_sequence',
    [orderId],
  );
}

export function getBatch(id: number): ProdBatch | null {
  return queryOne<ProdBatch>('SELECT * FROM prod_batches WHERE id = ?', [id]);
}

export function startBatch(batchId: number, operatorId?: string | null): void {
  const batch = getBatch(batchId);
  if (!batch) throw new Error('Batch not found.');
  assertBatchStatusTransition(batch.status, 'In Progress');
  const order = getOrder(batch.production_order_id);
  if (!order || !['Released', 'In Progress'].includes(order.status)) {
    throw new Error('Production order must be Released or In Progress.');
  }

  const ts = now();
  withDatabaseTransaction(() => {
    runQuery(
      `UPDATE prod_batches SET status = 'In Progress', started_at = ?, operator_id = ?, updated_at = ? WHERE id = ?`,
      [ts, operatorId ?? null, ts, batchId],
    );
    if (order.status === 'Released') {
      runQuery(
        `UPDATE prod_orders SET status = 'In Progress', updated_at = ? WHERE id = ?`,
        [ts, order.id],
      );
    }
    insertEvent('Batch Started', `Batch ${batch.batch_code} started`, order.id, batchId, operatorId);
  });
}

function computeActualLpa(volume: number | null | undefined, abv: number | null | undefined): number | null {
  if (volume == null || abv == null) return null;
  return computeLpa(volume, abv);
}

export function recordInput(input: RecordBatchInputData): number {
  const batch = getBatch(input.batchId);
  if (!batch) throw new Error('Batch not found.');
  if (!['In Progress', 'Paused'].includes(batch.status)) {
    throw new Error('Inputs can only be recorded on In Progress or Paused batches.');
  }

  if (input.inputType === 'Liquid Lot') {
    if (input.sourceTankId == null || input.liquidLotId == null) {
      throw new Error('Liquid lot input requires source tank and lot.');
    }
    const tank = getTank(input.sourceTankId);
    if (!tank || tank.tracking_mode !== 'LEDGER') {
      throw new Error('Source tank must be LEDGER-managed.');
    }
    const vol = input.actualVolumeLitres ?? input.actualQuantity;
    validatePositiveVolume(vol, 'Liquid volume');
    const lotBal = getLotBalance(input.liquidLotId);
    if (lotBal.volumeLitres < vol) {
      throw new Error(`Insufficient lot volume: ${lotBal.volumeLitres} L available.`);
    }
  }

  const lpa = computeActualLpa(input.actualVolumeLitres ?? input.actualQuantity, input.actualAbv ?? 0);
  return insertRow(
    `INSERT INTO prod_batch_inputs (
      batch_id, requirement_id, input_type, raw_material_id, bulk_spirit_id, liquid_lot_id,
      source_tank_id, packaging_material_id, actual_quantity, unit,
      actual_volume_litres, actual_abv, actual_lpa, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.batchId,
      input.requirementId ?? null,
      input.inputType,
      input.rawMaterialId ?? null,
      input.bulkSpiritId ?? null,
      input.liquidLotId ?? null,
      input.sourceTankId ?? null,
      input.packagingMaterialId ?? null,
      input.actualQuantity,
      input.unit,
      input.actualVolumeLitres ?? (input.inputType === 'Water' || input.inputType === 'Liquid Lot' || input.inputType === 'Bulk Spirit' ? input.actualQuantity : null),
      input.inputType === 'Water' ? 0 : (input.actualAbv ?? null),
      lpa,
      input.notes ?? '',
      now(),
    ],
  );
}

export function recordLoss(input: RecordBatchLossInput): number {
  validateLossReason(input.reason);
  const batch = getBatch(input.batchId);
  if (!batch) throw new Error('Batch not found.');
  if (!['In Progress', 'Paused'].includes(batch.status)) {
    throw new Error('Losses can only be recorded on active batches.');
  }

  let transactionId: number | null = null;
  if (input.volumeLitres != null && input.volumeLitres > 0 && input.tankId != null) {
    transactionId = postProcessLoss({
      tankId: input.tankId,
      lotId: input.liquidLotId,
      volumeLitres: input.volumeLitres,
      abv: input.abv ?? 0,
      lossType: input.lossType,
      reason: input.reason,
      sourceDocumentType: SOURCE_DOCUMENT_TYPES.PRODUCTION_BATCH,
      sourceDocumentId: batch.id,
      transactionGroupId: batch.transaction_group_id ?? undefined,
    });
  }

  const lossId = insertRow(
    `INSERT INTO prod_batch_losses (
      batch_id, loss_type, liquid_lot_id, tank_id, volume_litres, abv, lpa,
      quantity, unit, reason, transaction_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.batchId,
      input.lossType,
      input.liquidLotId ?? null,
      input.tankId ?? null,
      input.volumeLitres ?? null,
      input.abv ?? null,
      input.volumeLitres != null && input.abv != null ? computeLpa(input.volumeLitres, input.abv) : null,
      input.quantity ?? null,
      input.unit ?? null,
      input.reason,
      transactionId,
      now(),
    ],
  );
  insertEvent('Loss Recorded', `Loss recorded: ${input.lossType}`, batch.production_order_id, batch.id);
  return lossId;
}

function getLiquidInputs(batchId: number): ProdBatchInput[] {
  return queryAll<ProdBatchInput>(
    `SELECT * FROM prod_batch_inputs WHERE batch_id = ? AND input_type IN ('Liquid Lot', 'Bulk Spirit')`,
    [batchId],
  );
}

function getWaterInputs(batchId: number): ProdBatchInput[] {
  return queryAll<ProdBatchInput>(
    `SELECT * FROM prod_batch_inputs WHERE batch_id = ? AND input_type = 'Water'`,
    [batchId],
  );
}

function allocateOperationGroupId(): string {
  const seqType = 'operationGroup' as const;
  const prefix = codePrefixForEntity(seqType);
  const row = queryOne<{ last_number: number }>(
    'SELECT last_number FROM md_code_sequences WHERE entity_type = ?',
    [seqType],
  );
  const next = (row?.last_number ?? 0) + 1;
  if (row) {
    runQuery('UPDATE md_code_sequences SET last_number = ? WHERE entity_type = ?', [next, seqType]);
  } else {
    insertRow('INSERT INTO md_code_sequences (entity_type, last_number) VALUES (?, ?)', [seqType, next]);
  }
  return formatBusinessCode(prefix, next);
}

export function completeBatch(input: CompleteBatchInput): { lotId: number; transactionIds: number[] } {
  const batch = getBatch(input.batchId);
  if (!batch) throw new Error('Batch not found.');
  if (batch.status !== 'In Progress') {
    throw new Error('Only In Progress batches can be completed.');
  }
  const order = getOrder(batch.production_order_id);
  if (!order) throw new Error('Production order not found.');

  validatePositiveVolume(input.actualOutputLitres, 'Output volume');
  const outputLpa = computeLpa(input.actualOutputLitres, input.actualOutputAbv);

  return withDatabaseTransaction(() => {
    const groupId = batch.transaction_group_id ?? allocateOperationGroupId();
    const docType = SOURCE_DOCUMENT_TYPES.PRODUCTION_BATCH;
    const docId = batch.id;
    let lotId = 0;
    let transactionIds: number[] = [];

    const productionType = order.production_type;

    if (productionType === 'Blending') {
      const liquidInputs = getLiquidInputs(batch.id);
      if (liquidInputs.length < 2) throw new Error('Blend requires at least two liquid inputs.');
      const sourceTankId = liquidInputs[0]?.source_tank_id;
      if (sourceTankId == null) throw new Error('Blend requires a source tank.');
      const result = createBlend({
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
      const spiritInput = getLiquidInputs(batch.id)[0];
      const waterInput = getWaterInputs(batch.id)[0];
      if (!spiritInput || !waterInput) {
        throw new Error('Proof-down requires spirit and water inputs.');
      }
      const result = proofDown({
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
      throw new Error(`Batch completion for production type "${productionType}" requires Proof Down or Blending in Phase 1E.`);
    }

    const ts = now();
    runQuery(
      `UPDATE prod_batches SET
        status = 'Completed', completed_at = ?, destination_tank_id = ?, output_lot_id = ?,
        actual_output_litres = ?, actual_output_abv = ?, actual_output_lpa = ?,
        actual_brix = ?, actual_ph = ?, actual_carbonation_volumes = ?,
        transaction_group_id = ?, operator_id = COALESCE(?, operator_id), updated_at = ?
       WHERE id = ?`,
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
        ts,
        batch.id,
      ],
    );

    runQuery(
      `UPDATE prod_batch_inputs SET transaction_group_id = ? WHERE batch_id = ?`,
      [groupId, batch.id],
    );

    insertEvent('Batch Completed', `Batch ${batch.batch_code} completed`, order.id, batch.id, input.operatorId);

    const openBatches = queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM prod_batches
       WHERE production_order_id = ? AND status NOT IN ('Completed', 'Cancelled')`,
      [order.id],
    )?.count ?? 0;
    if (openBatches === 0) {
      runQuery(
        `UPDATE prod_orders SET status = 'Completed', completed_at = ?, updated_at = ? WHERE id = ?`,
        [ts, ts, order.id],
      );
      insertEvent('Order Completed', `Order ${order.order_code} completed`, order.id);
    }

    return { lotId, transactionIds };
  });
}

export function cancelBatch(batchId: number, userId?: string | null): void {
  const batch = getBatch(batchId);
  if (!batch) throw new Error('Batch not found.');
  if (batch.transaction_group_id) {
    throw new Error('Cannot cancel batch with posted ledger transactions. Use reversal workflow.');
  }
  assertBatchStatusTransition(batch.status, 'Cancelled');
  runQuery(`UPDATE prod_batches SET status = 'Cancelled', updated_at = ? WHERE id = ?`, [now(), batchId]);
  insertEvent('Batch Cancelled', `Batch ${batch.batch_code} cancelled`, batch.production_order_id, batchId, userId);
}

export function completeOrder(orderId: number, userId?: string | null): void {
  const order = getOrder(orderId);
  if (!order) throw new Error('Production order not found.');
  const unfinished = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM prod_batches
     WHERE production_order_id = ? AND status NOT IN ('Completed', 'Cancelled')`,
    [orderId],
  )?.count ?? 0;
  if (unfinished > 0) {
    throw new Error('Cannot complete order while batches remain unfinished.');
  }
  assertOrderStatusTransition(order.status, 'Completed');
  const ts = now();
  runQuery(
    `UPDATE prod_orders SET status = 'Completed', completed_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, orderId],
  );
  insertEvent('Order Completed', `Order ${order.order_code} manually completed`, orderId, null, userId);
}

export function getPlannedVsActual(batchId: number): PlannedVsActualLine[] {
  const batch = getBatch(batchId);
  if (!batch) return [];
  const requirements = getRequirements(batch.production_order_id);
  const inputs = queryAll<ProdBatchInput>('SELECT * FROM prod_batch_inputs WHERE batch_id = ?', [batchId]);
  const lines: PlannedVsActualLine[] = [];

  for (const req of requirements) {
    const related = inputs.filter((i) => i.requirement_id === req.id);
    const actualQty = related.reduce((s, i) => s + i.actual_quantity, 0);
    const actualVol = related.reduce((s, i) => s + (i.actual_volume_litres ?? 0), 0);
    const actualLpa = related.reduce((s, i) => s + (i.actual_lpa ?? 0), 0);
    lines.push({
      requirementId: req.id,
      inputType: req.requirement_type,
      description: req.description,
      unit: req.unit,
      plannedQuantity: req.planned_quantity,
      actualQuantity: actualQty,
      variance: quantityVariance(actualQty, req.planned_quantity),
      variancePercent: ingredientVariancePercent(actualQty, req.planned_quantity),
      plannedVolumeLitres: req.planned_volume_litres,
      actualVolumeLitres: actualVol || null,
      plannedAbv: req.planned_abv,
      actualAbv: related[0]?.actual_abv ?? null,
      plannedLpa: req.planned_lpa,
      actualLpa: actualLpa || null,
    });
  }
  return lines;
}

export function getBatchLedgerTransactions(batchId: number): LiqTransaction[] {
  return queryAll<LiqTransaction>(
    `SELECT t.*,
      st.name AS source_tank_name, dt.name AS destination_tank_name,
      sl.lot_code AS source_lot_code, dl.lot_code AS destination_lot_code
     FROM liq_transactions t
     LEFT JOIN liq_tanks st ON st.id = t.source_tank_id
     LEFT JOIN liq_tanks dt ON dt.id = t.destination_tank_id
     LEFT JOIN liq_lots sl ON sl.id = t.source_lot_id
     LEFT JOIN liq_lots dl ON dl.id = t.destination_lot_id
     WHERE t.source_document_type = ? AND t.source_document_id = ?
     ORDER BY t.transaction_timestamp DESC, t.id DESC`,
    [SOURCE_DOCUMENT_TYPES.PRODUCTION_BATCH, batchId],
  );
}

export function getBatchSteps(batchId: number): ProdBatchStep[] {
  return queryAll<ProdBatchStep>(
    'SELECT * FROM prod_batch_steps WHERE batch_id = ? ORDER BY step_number',
    [batchId],
  );
}

export function updateBatchStepStatus(stepId: number, status: string, completedBy?: string | null): void {
  const ts = now();
  runQuery(
    `UPDATE prod_batch_steps SET status = ?, completed_at = ?, completed_by = ? WHERE id = ?`,
    [status, status === 'Completed' ? ts : null, completedBy ?? null, stepId],
  );
}

export function getEvents(orderId: number): ProdEvent[] {
  return queryAll<ProdEvent>(
    'SELECT * FROM prod_events WHERE production_order_id = ? ORDER BY created_at',
    [orderId],
  );
}

export function getProductionProgress(orderId: number): ProductionProgress {
  const order = getOrder(orderId);
  if (!order) throw new Error('Production order not found.');
  const batches = getBatches(orderId);
  const completed = batches.filter((b) => b.status === 'Completed');
  const plannedTotal = order.planned_output_litres ?? order.planned_batch_size;
  const completedActual = completed.reduce((s, b) => s + (b.actual_output_litres ?? 0), 0);
  return {
    orderId,
    plannedTotal,
    completedActual,
    percentComplete: plannedTotal > 0 ? (completedActual / plannedTotal) * 100 : null,
    unit: order.batch_size_unit,
    batchCount: batches.length,
    completedBatchCount: completed.length,
  };
}

export function getProductionTypes(): string[] {
  const fromLookup = getLookupNames(PRODUCTION_LOOKUP_TYPES.PRODUCTION_TYPE);
  return fromLookup.length > 0 ? fromLookup : [...PRODUCTION_TYPES];
}
