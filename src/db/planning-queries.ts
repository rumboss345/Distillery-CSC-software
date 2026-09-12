/**
 * Phase 1M Production Planning, Demand Forecasting & MRP.
 * Read-only recommendations — does NOT auto-create POs or mutate inventory.
 */
import { OPEN_PO_STATUSES } from '../../shared/planning/constants';
import {
  computeNetRequirement,
  detectResourceConflicts,
  explodeRecipeMaterialRequirements,
  normalizeDemandToUnits,
  type ResourceConflict,
  type ScheduleSlot,
} from '../../shared/planning/mrp-engine';
import type {
  AddDemandForecastLineInput,
  AddProductionPlanLineInput,
  CreateDemandForecastInput,
  CreateProductionPlanInput,
  CreateScheduleSlotInput,
  PlanDemandForecast,
  PlanDemandForecastLine,
  PlanMrpLine,
  PlanMrpRun,
  PlanProductionPlan,
  PlanProductionPlanLine,
  PlanSafetyStock,
  PlanScheduleSlot,
  PlanningDashboardSummary,
  SkuDemandSummary,
  UpsertSafetyStockInput,
} from '../types/planning';
import { computeSkuBalance } from './finished-goods-queries';
import { insertRow, queryAll, queryOne, runQuery } from './database';
import { getMaterialBalance } from './material-inventory-queries';
import { nextBusinessCode } from './master-data-queries';
import { getRemainingQuantity } from './purchasing-queries';
import { getRecipeIngredients, getRecipePackaging } from './recipes-queries';

export {
  casesToUnits,
  computeNetRequirement,
  detectResourceConflicts,
  explodeRecipeMaterialRequirements,
  normalizeDemandToUnits,
  unitsToCases,
} from '../../shared/planning/mrp-engine';

const now = () => new Date().toISOString();

function getSkuContainersPerCase(skuId: number): number {
  const row = queryOne<{ containers_per_case: number }>(
    'SELECT containers_per_case FROM md_skus WHERE id = ?',
    [skuId],
  );
  if (!row) throw new Error('SKU not found.');
  return row.containers_per_case > 0 ? row.containers_per_case : 1;
}

function getSkuSafetyStock(skuId: number): number {
  return queryOne<{ safety_stock_quantity: number }>(
    `SELECT safety_stock_quantity FROM plan_safety_stock
     WHERE item_type = 'SKU' AND sku_id = ?`,
    [skuId],
  )?.safety_stock_quantity ?? 0;
}

function getMaterialSafetyStock(
  materialType: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL',
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
): number {
  if (materialType === 'RAW_MATERIAL') {
    return queryOne<{ safety_stock_quantity: number }>(
      `SELECT safety_stock_quantity FROM plan_safety_stock
       WHERE item_type = 'RAW_MATERIAL' AND raw_material_id = ?`,
      [rawMaterialId],
    )?.safety_stock_quantity ?? 0;
  }
  return queryOne<{ safety_stock_quantity: number }>(
    `SELECT safety_stock_quantity FROM plan_safety_stock
     WHERE item_type = 'PACKAGING_MATERIAL' AND packaging_material_id = ?`,
    [packagingMaterialId],
  )?.safety_stock_quantity ?? 0;
}

/** Sum remaining open PO quantity for a material (Submitted / Partially Received only). */
export function getOpenPoQuantityForMaterial(
  materialType: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL',
  rawMaterialId: number | null,
  packagingMaterialId: number | null,
): number {
  const statusPlaceholders = OPEN_PO_STATUSES.map(() => '?').join(', ');
  const lines = queryAll<{ id: number }>(
    `SELECT pol.id
     FROM pur_purchase_order_lines pol
     JOIN pur_purchase_orders po ON po.id = pol.purchase_order_id
     WHERE po.status IN (${statusPlaceholders})
       AND pol.material_type = ?
       AND (
         (pol.raw_material_id IS NOT NULL AND pol.raw_material_id = ?)
         OR (pol.packaging_material_id IS NOT NULL AND pol.packaging_material_id = ?)
       )`,
    [...OPEN_PO_STATUSES, materialType, rawMaterialId ?? -1, packagingMaterialId ?? -1],
  );
  return lines.reduce((sum, line) => sum + getRemainingQuantity(line.id), 0);
}

export function createDemandForecast(input: CreateDemandForecastInput): number {
  const code = nextBusinessCode('demandForecast', 'plan_demand_forecasts', 'forecast_code');
  const ts = now();
  return insertRow(
    `INSERT INTO plan_demand_forecasts (
      forecast_code, name, period_type, period_start, period_end, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?, ?)`,
    [
      code,
      input.name,
      input.periodType ?? 'weekly',
      input.periodStart,
      input.periodEnd,
      input.notes ?? '',
      ts,
      ts,
    ],
  );
}

export function addDemandForecastLine(input: AddDemandForecastLineInput): number {
  const forecast = getDemandForecast(input.forecastId);
  if (!forecast) throw new Error('Demand forecast not found.');
  if (input.demandQuantity < 0) throw new Error('Demand quantity cannot be negative.');
  getSkuContainersPerCase(input.skuId);
  return insertRow(
    `INSERT INTO plan_demand_forecast_lines (
      forecast_id, sku_id, demand_quantity, quantity_unit, period_label, notes
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.forecastId,
      input.skuId,
      input.demandQuantity,
      input.quantityUnit ?? 'units',
      input.periodLabel ?? '',
      input.notes ?? '',
    ],
  );
}

export function getDemandForecast(id: number): PlanDemandForecast | null {
  return queryOne<PlanDemandForecast>('SELECT * FROM plan_demand_forecasts WHERE id = ?', [id]);
}

export function listDemandForecasts(): PlanDemandForecast[] {
  return queryAll<PlanDemandForecast>(
    'SELECT * FROM plan_demand_forecasts ORDER BY period_start DESC, id DESC',
  );
}

export function getDemandForecastLines(forecastId: number): PlanDemandForecastLine[] {
  return queryAll<PlanDemandForecastLine & { containers_per_case: number }>(
    `SELECT l.*, s.sku_code, s.name AS sku_name, s.containers_per_case
     FROM plan_demand_forecast_lines l
     JOIN md_skus s ON s.id = l.sku_id
     WHERE l.forecast_id = ?
     ORDER BY l.id`,
    [forecastId],
  ).map(({ containers_per_case, ...line }) => ({
    ...line,
    demand_units: normalizeDemandToUnits(
      line.demand_quantity,
      line.quantity_unit,
      containers_per_case ?? 1,
    ),
  }));
}

export function computeSkuDemandSummary(skuId: number, forecastId?: number): SkuDemandSummary {
  const sku = queryOne<{ sku_code: string; name: string; containers_per_case: number }>(
    'SELECT sku_code, name, containers_per_case FROM md_skus WHERE id = ?',
    [skuId],
  );
  if (!sku) throw new Error('SKU not found.');

  let grossDemandUnits = 0;
  if (forecastId != null) {
    const lines = getDemandForecastLines(forecastId).filter((l) => l.sku_id === skuId);
    grossDemandUnits = lines.reduce((s, l) => s + (l.demand_units ?? 0), 0);
  } else {
    const rows = queryAll<{ demand_quantity: number; quantity_unit: string }>(
      `SELECT l.demand_quantity, l.quantity_unit
       FROM plan_demand_forecast_lines l
       JOIN plan_demand_forecasts f ON f.id = l.forecast_id
       WHERE l.sku_id = ? AND f.status = 'Active'`,
      [skuId],
    );
    grossDemandUnits = rows.reduce(
      (s, r) => s + normalizeDemandToUnits(r.demand_quantity, r.quantity_unit as 'units' | 'cases', sku.containers_per_case),
      0,
    );
  }

  const onHandUnits = computeSkuBalance(skuId);
  const safetyStockUnits = getSkuSafetyStock(skuId);
  const net = computeNetRequirement({
    grossRequirement: grossDemandUnits,
    onHandQuantity: onHandUnits,
    openPoQuantity: 0,
    safetyStockQuantity: safetyStockUnits,
  });

  return {
    skuId,
    skuCode: sku.sku_code,
    skuName: sku.name,
    grossDemandUnits,
    onHandUnits,
    safetyStockUnits,
    netRequirementUnits: net.netRequirement,
    shortageUnits: net.shortageQuantity,
  };
}

export function createProductionPlan(input: CreateProductionPlanInput): number {
  const code = nextBusinessCode('productionPlan', 'plan_production_plans', 'plan_code');
  const ts = now();
  return insertRow(
    `INSERT INTO plan_production_plans (
      plan_code, name, plan_start, plan_end, status, linked_forecast_id, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Draft', ?, ?, ?, ?)`,
    [
      code,
      input.name,
      input.planStart,
      input.planEnd,
      input.linkedForecastId ?? null,
      input.notes ?? '',
      ts,
      ts,
    ],
  );
}

export function addProductionPlanLine(input: AddProductionPlanLineInput): number {
  const plan = getProductionPlan(input.productionPlanId);
  if (!plan) throw new Error('Production plan not found.');
  if (input.plannedQuantity <= 0) throw new Error('Planned quantity must be positive.');
  getSkuContainersPerCase(input.skuId);
  return insertRow(
    `INSERT INTO plan_production_plan_lines (
      production_plan_id, sku_id, recipe_id, recipe_version_id,
      planned_quantity, quantity_unit, planned_start, planned_end, floor_equipment_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.productionPlanId,
      input.skuId,
      input.recipeId ?? null,
      input.recipeVersionId ?? null,
      input.plannedQuantity,
      input.quantityUnit ?? 'units',
      input.plannedStart ?? null,
      input.plannedEnd ?? null,
      input.floorEquipmentId ?? null,
      input.notes ?? '',
    ],
  );
}

export function getProductionPlan(id: number): PlanProductionPlan | null {
  return queryOne<PlanProductionPlan>('SELECT * FROM plan_production_plans WHERE id = ?', [id]);
}

export function listProductionPlans(): PlanProductionPlan[] {
  return queryAll<PlanProductionPlan>(
    'SELECT * FROM plan_production_plans ORDER BY plan_start DESC, id DESC',
  );
}

export function getProductionPlanLines(productionPlanId: number): PlanProductionPlanLine[] {
  return queryAll<PlanProductionPlanLine & { containers_per_case: number }>(
    `SELECT l.*, s.sku_code, s.name AS sku_name, s.containers_per_case, fe.name AS equipment_name
     FROM plan_production_plan_lines l
     JOIN md_skus s ON s.id = l.sku_id
     LEFT JOIN floor_equipment fe ON fe.id = l.floor_equipment_id
     WHERE l.production_plan_id = ?
     ORDER BY l.id`,
    [productionPlanId],
  ).map(({ containers_per_case, ...line }) => ({
    ...line,
    planned_units: normalizeDemandToUnits(
      line.planned_quantity,
      line.quantity_unit,
      containers_per_case ?? 1,
    ),
  }));
}

export function upsertSafetyStock(input: UpsertSafetyStockInput): number {
  if (input.safetyStockQuantity < 0) throw new Error('Safety stock cannot be negative.');
  const ts = now();
  let existingId: number | null = null;

  if (input.itemType === 'SKU' && input.skuId) {
    existingId = queryOne<{ id: number }>(
      `SELECT id FROM plan_safety_stock WHERE item_type = 'SKU' AND sku_id = ?`,
      [input.skuId],
    )?.id ?? null;
  } else if (input.itemType === 'RAW_MATERIAL' && input.rawMaterialId) {
    existingId = queryOne<{ id: number }>(
      `SELECT id FROM plan_safety_stock WHERE item_type = 'RAW_MATERIAL' AND raw_material_id = ?`,
      [input.rawMaterialId],
    )?.id ?? null;
  } else if (input.itemType === 'PACKAGING_MATERIAL' && input.packagingMaterialId) {
    existingId = queryOne<{ id: number }>(
      `SELECT id FROM plan_safety_stock WHERE item_type = 'PACKAGING_MATERIAL' AND packaging_material_id = ?`,
      [input.packagingMaterialId],
    )?.id ?? null;
  } else {
    throw new Error('Invalid safety stock item reference.');
  }

  if (existingId != null) {
    runQuery(
      `UPDATE plan_safety_stock SET
        safety_stock_quantity = ?, unit = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [input.safetyStockQuantity, input.unit ?? 'units', input.notes ?? '', ts, existingId],
    );
    return existingId;
  }

  return insertRow(
    `INSERT INTO plan_safety_stock (
      item_type, sku_id, raw_material_id, packaging_material_id,
      safety_stock_quantity, unit, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.itemType,
      input.skuId ?? null,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
      input.safetyStockQuantity,
      input.unit ?? 'units',
      input.notes ?? '',
      ts,
      ts,
    ],
  );
}

export function listSafetyStock(): PlanSafetyStock[] {
  return queryAll<PlanSafetyStock>(
    `SELECT ss.*,
      COALESCE(s.sku_code, rm.material_code, pm.packaging_code) AS item_code,
      COALESCE(s.name, rm.name, pm.name) AS item_name
     FROM plan_safety_stock ss
     LEFT JOIN md_skus s ON ss.item_type = 'SKU' AND s.id = ss.sku_id
     LEFT JOIN md_raw_materials rm ON ss.item_type = 'RAW_MATERIAL' AND rm.id = ss.raw_material_id
     LEFT JOIN md_packaging_materials pm ON ss.item_type = 'PACKAGING_MATERIAL' AND pm.id = ss.packaging_material_id
     ORDER BY ss.item_type, item_code`,
  );
}

function deriveBaseBatchOutputUnits(recipeVersionId: number, skuId: number): number {
  const packaging = getRecipePackaging(recipeVersionId).filter(
    (p) => p.sku_id == null || p.sku_id === skuId,
  );
  const fromPackaging = packaging.reduce((s, p) => s + p.quantity, 0);
  if (fromPackaging > 0) return fromPackaging;
  const version = queryOne<{ expected_final_volume_litres: number | null }>(
    'SELECT expected_final_volume_litres FROM rc_recipe_versions WHERE id = ?',
    [recipeVersionId],
  );
  return version?.expected_final_volume_litres && version.expected_final_volume_litres > 0
    ? version.expected_final_volume_litres
    : 1000;
}

/** Run MRP for a production plan — persists snapshot lines; does NOT create POs. */
export function runMrpForProductionPlan(productionPlanId: number): number {
  const plan = getProductionPlan(productionPlanId);
  if (!plan) throw new Error('Production plan not found.');

  const code = nextBusinessCode('mrpRun', 'plan_mrp_runs', 'run_code');
  const runDate = now().slice(0, 10);
  const runId = insertRow(
    `INSERT INTO plan_mrp_runs (run_code, production_plan_id, run_date, status, notes, created_at)
     VALUES (?, ?, ?, 'Completed', '', datetime('now'))`,
    [code, productionPlanId, runDate],
  );

  const materialTotals = new Map<string, {
    materialType: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL';
    rawMaterialId: number | null;
    packagingMaterialId: number | null;
    grossRequirement: number;
    unit: string;
  }>();

  const planLines = getProductionPlanLines(productionPlanId);
  for (const line of planLines) {
    if (!line.recipe_version_id) continue;
    const targetUnits = line.planned_units ?? line.planned_quantity;
    const baseUnits = deriveBaseBatchOutputUnits(line.recipe_version_id, line.sku_id);
    const ingredients = getRecipeIngredients(line.recipe_version_id).map((ing) => ({
      rawMaterialId: ing.raw_material_id,
      packagingMaterialId: null as number | null,
      ingredientType: ing.ingredient_type,
      quantity: ing.quantity,
      unit: ing.unit,
      quantityBasis: ing.quantity_basis,
      optional: !!ing.optional,
    }));
    const packaging = getRecipePackaging(line.recipe_version_id).map((pkg) => ({
      rawMaterialId: null as number | null,
      packagingMaterialId: pkg.packaging_material_id,
      ingredientType: 'Packaging',
      quantity: pkg.quantity,
      unit: 'each',
      quantityBasis: pkg.quantity_basis,
      optional: false,
    }));
    const exploded = explodeRecipeMaterialRequirements({
      ingredients: [...ingredients, ...packaging],
      baseBatchOutputUnits: baseUnits,
      targetOutputUnits: targetUnits,
    });
    for (const req of exploded) {
      const key = `${req.materialType}:${req.rawMaterialId ?? ''}:${req.packagingMaterialId ?? ''}`;
      const existing = materialTotals.get(key);
      if (existing) {
        existing.grossRequirement += req.grossRequirement;
      } else {
        materialTotals.set(key, { ...req });
      }
    }
  }

  for (const req of materialTotals.values()) {
    const balance = getMaterialBalance(req.materialType, req.rawMaterialId, req.packagingMaterialId);
    const openPo = getOpenPoQuantityForMaterial(req.materialType, req.rawMaterialId, req.packagingMaterialId);
    const safety = getMaterialSafetyStock(req.materialType, req.rawMaterialId, req.packagingMaterialId);
    const net = computeNetRequirement({
      grossRequirement: req.grossRequirement,
      onHandQuantity: balance.onHand,
      openPoQuantity: openPo,
      safetyStockQuantity: safety,
    });
    const notes = net.recommendedPurchaseQty > 0
      ? 'Recommendation only — does not create purchase orders.'
      : '';
    insertRow(
      `INSERT INTO plan_mrp_lines (
        mrp_run_id, material_type, raw_material_id, packaging_material_id, sku_id,
        gross_requirement, on_hand_quantity, open_po_quantity, safety_stock_quantity,
        net_requirement, shortage_quantity, recommended_purchase_qty, unit, recommendation_notes
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        req.materialType,
        req.rawMaterialId,
        req.packagingMaterialId,
        req.grossRequirement,
        balance.onHand,
        openPo,
        safety,
        net.netRequirement,
        net.shortageQuantity,
        net.recommendedPurchaseQty,
        req.unit || balance.baseUnit,
        notes,
      ],
    );
  }

  return runId;
}

export function getMrpRun(id: number): PlanMrpRun | null {
  return queryOne<PlanMrpRun>('SELECT * FROM plan_mrp_runs WHERE id = ?', [id]);
}

export function listMrpRuns(): PlanMrpRun[] {
  return queryAll<PlanMrpRun>('SELECT * FROM plan_mrp_runs ORDER BY run_date DESC, id DESC');
}

export function getMrpLines(mrpRunId: number): PlanMrpLine[] {
  return queryAll<PlanMrpLine>(
    `SELECT ml.*,
      COALESCE(rm.material_code, pm.packaging_code, s.sku_code) AS item_code,
      COALESCE(rm.name, pm.name, s.name) AS item_name
     FROM plan_mrp_lines ml
     LEFT JOIN md_raw_materials rm ON ml.raw_material_id = rm.id
     LEFT JOIN md_packaging_materials pm ON ml.packaging_material_id = pm.id
     LEFT JOIN md_skus s ON ml.sku_id = s.id
     WHERE ml.mrp_run_id = ?
     ORDER BY ml.shortage_quantity DESC, ml.id`,
    [mrpRunId],
  );
}

export function listPurchasingRecommendations(mrpRunId?: number): PlanMrpLine[] {
  if (mrpRunId != null) {
    return getMrpLines(mrpRunId).filter((l) => l.recommended_purchase_qty > 0);
  }
  const latest = queryOne<{ id: number }>(
    'SELECT id FROM plan_mrp_runs ORDER BY run_date DESC, id DESC LIMIT 1',
  );
  if (!latest) return [];
  return getMrpLines(latest.id).filter((l) => l.recommended_purchase_qty > 0);
}

export function createScheduleSlot(input: CreateScheduleSlotInput): number {
  if (new Date(input.scheduledEnd) <= new Date(input.scheduledStart)) {
    throw new Error('Scheduled end must be after start.');
  }
  const code = nextBusinessCode('scheduleSlot', 'plan_schedule_slots', 'schedule_code');
  return insertRow(
    `INSERT INTO plan_schedule_slots (
      schedule_code, production_plan_line_id, production_order_id, floor_equipment_id,
      sku_id, scheduled_start, scheduled_end, status, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      code,
      input.productionPlanLineId ?? null,
      input.productionOrderId ?? null,
      input.floorEquipmentId,
      input.skuId ?? null,
      input.scheduledStart,
      input.scheduledEnd,
      input.status ?? 'Planned',
      input.notes ?? '',
    ],
  );
}

export function listScheduleSlots(): PlanScheduleSlot[] {
  return queryAll<PlanScheduleSlot>(
    `SELECT ss.*, fe.name AS equipment_name, s.sku_code
     FROM plan_schedule_slots ss
     JOIN floor_equipment fe ON fe.id = ss.floor_equipment_id
     LEFT JOIN md_skus s ON s.id = ss.sku_id
     WHERE ss.status NOT IN ('Cancelled', 'Completed')
     ORDER BY ss.scheduled_start`,
  );
}

export function listScheduleConflicts(): ResourceConflict[] {
  const slots: ScheduleSlot[] = listScheduleSlots().map((s) => ({
    id: s.id,
    floorEquipmentId: s.floor_equipment_id,
    scheduledStart: s.scheduled_start,
    scheduledEnd: s.scheduled_end,
    label: s.schedule_code,
  }));
  return detectResourceConflicts(slots);
}

export function getPlanningDashboardSummary(): PlanningDashboardSummary {
  const activeForecasts = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM plan_demand_forecasts WHERE status = 'Active'`,
  )?.count ?? 0;
  const openPlans = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM plan_production_plans WHERE status IN ('Draft', 'Approved', 'In Progress')`,
  )?.count ?? 0;
  const recentMrpRuns = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM plan_mrp_runs WHERE run_date >= date('now', '-30 days')`,
  )?.count ?? 0;
  const latestRun = queryOne<{ id: number }>(
    'SELECT id FROM plan_mrp_runs ORDER BY run_date DESC, id DESC LIMIT 1',
  );
  const totalShortages = latestRun
    ? queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM plan_mrp_lines
       WHERE mrp_run_id = ? AND shortage_quantity > 0`,
      [latestRun.id],
    )?.count ?? 0
    : 0;

  return {
    activeForecasts,
    openPlans,
    recentMrpRuns,
    scheduleConflicts: listScheduleConflicts().length,
    totalShortages,
  };
}
