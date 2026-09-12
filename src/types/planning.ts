import type {
  DemandForecastStatus,
  DemandPeriodType,
  DemandQuantityUnit,
  MrpRunStatus,
  PlanScheduleStatus,
  ProductionPlanStatus,
  SafetyStockItemType,
} from '../../shared/planning/constants';

export interface PlanDemandForecast {
  id: number;
  forecast_code: string;
  name: string;
  period_type: DemandPeriodType;
  period_start: string;
  period_end: string;
  status: DemandForecastStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PlanDemandForecastLine {
  id: number;
  forecast_id: number;
  sku_id: number;
  sku_code?: string;
  sku_name?: string;
  demand_quantity: number;
  quantity_unit: DemandQuantityUnit;
  period_label: string;
  notes: string;
  demand_units?: number;
}

export interface CreateDemandForecastInput {
  name: string;
  periodType?: DemandPeriodType;
  periodStart: string;
  periodEnd: string;
  notes?: string;
}

export interface AddDemandForecastLineInput {
  forecastId: number;
  skuId: number;
  demandQuantity: number;
  quantityUnit?: DemandQuantityUnit;
  periodLabel?: string;
  notes?: string;
}

export interface PlanProductionPlan {
  id: number;
  plan_code: string;
  name: string;
  plan_start: string;
  plan_end: string;
  status: ProductionPlanStatus;
  linked_forecast_id: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PlanProductionPlanLine {
  id: number;
  production_plan_id: number;
  sku_id: number;
  sku_code?: string;
  sku_name?: string;
  recipe_id: number | null;
  recipe_version_id: number | null;
  planned_quantity: number;
  quantity_unit: DemandQuantityUnit;
  planned_start: string | null;
  planned_end: string | null;
  floor_equipment_id: number | null;
  equipment_name?: string | null;
  notes: string;
  planned_units?: number;
}

export interface CreateProductionPlanInput {
  name: string;
  planStart: string;
  planEnd: string;
  linkedForecastId?: number | null;
  notes?: string;
}

export interface AddProductionPlanLineInput {
  productionPlanId: number;
  skuId: number;
  recipeId?: number | null;
  recipeVersionId?: number | null;
  plannedQuantity: number;
  quantityUnit?: DemandQuantityUnit;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  floorEquipmentId?: number | null;
  notes?: string;
}

export interface PlanSafetyStock {
  id: number;
  item_type: SafetyStockItemType;
  sku_id: number | null;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  item_code?: string;
  item_name?: string;
  safety_stock_quantity: number;
  unit: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertSafetyStockInput {
  itemType: SafetyStockItemType;
  skuId?: number | null;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  safetyStockQuantity: number;
  unit?: string;
  notes?: string;
}

export interface PlanMrpRun {
  id: number;
  run_code: string;
  production_plan_id: number | null;
  run_date: string;
  status: MrpRunStatus;
  notes: string;
  created_at: string;
}

export interface PlanMrpLine {
  id: number;
  mrp_run_id: number;
  material_type: string;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  sku_id: number | null;
  item_code?: string;
  item_name?: string;
  gross_requirement: number;
  on_hand_quantity: number;
  open_po_quantity: number;
  safety_stock_quantity: number;
  net_requirement: number;
  shortage_quantity: number;
  recommended_purchase_qty: number;
  unit: string;
  recommendation_notes: string;
}

export interface PlanScheduleSlot {
  id: number;
  schedule_code: string;
  production_plan_line_id: number | null;
  production_order_id: number | null;
  floor_equipment_id: number;
  equipment_name?: string;
  sku_id: number | null;
  sku_code?: string;
  scheduled_start: string;
  scheduled_end: string;
  status: PlanScheduleStatus;
  notes: string;
  created_at: string;
}

export interface CreateScheduleSlotInput {
  productionPlanLineId?: number | null;
  productionOrderId?: number | null;
  floorEquipmentId: number;
  skuId?: number | null;
  scheduledStart: string;
  scheduledEnd: string;
  status?: PlanScheduleStatus;
  notes?: string;
}

export interface PlanningDashboardSummary {
  activeForecasts: number;
  openPlans: number;
  recentMrpRuns: number;
  scheduleConflicts: number;
  totalShortages: number;
}

export interface SkuDemandSummary {
  skuId: number;
  skuCode: string;
  skuName: string;
  grossDemandUnits: number;
  onHandUnits: number;
  safetyStockUnits: number;
  netRequirementUnits: number;
  shortageUnits: number;
}
