/** Phase 1M Production Planning, Demand Forecasting & MRP. */

export const DEMAND_PERIOD_TYPES = ['weekly', 'monthly'] as const;
export type DemandPeriodType = (typeof DEMAND_PERIOD_TYPES)[number];

export const DEMAND_FORECAST_STATUSES = ['Draft', 'Active', 'Closed'] as const;
export type DemandForecastStatus = (typeof DEMAND_FORECAST_STATUSES)[number];

export const PRODUCTION_PLAN_STATUSES = ['Draft', 'Approved', 'In Progress', 'Closed'] as const;
export type ProductionPlanStatus = (typeof PRODUCTION_PLAN_STATUSES)[number];

export const MRP_RUN_STATUSES = ['Draft', 'Completed'] as const;
export type MrpRunStatus = (typeof MRP_RUN_STATUSES)[number];

export const PLAN_SCHEDULE_STATUSES = ['Planned', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'] as const;
export type PlanScheduleStatus = (typeof PLAN_SCHEDULE_STATUSES)[number];

export const SAFETY_STOCK_ITEM_TYPES = ['SKU', 'RAW_MATERIAL', 'PACKAGING_MATERIAL'] as const;
export type SafetyStockItemType = (typeof SAFETY_STOCK_ITEM_TYPES)[number];

export const DEMAND_QUANTITY_UNITS = ['units', 'cases'] as const;
export type DemandQuantityUnit = (typeof DEMAND_QUANTITY_UNITS)[number];

export const OPEN_PO_STATUSES = ['Submitted', 'Partially Received'] as const;
