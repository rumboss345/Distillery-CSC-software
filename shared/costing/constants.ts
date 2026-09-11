/** Base costing currency for CSC operations. */
export const BASE_COSTING_CURRENCY = 'KYD' as const;

export const COST_STATUSES = [
  'UNVALUED',
  'PARTIALLY_VALUED',
  'VALUED',
  'FINALIZED',
  'ADJUSTED',
  'INCOMPLETE',
  'ERROR',
] as const;

export type CostStatus = (typeof COST_STATUSES)[number];

export const LANDED_COST_STATUSES = ['Draft', 'Finalized', 'Reversed'] as const;
export type LandedCostStatus = (typeof LANDED_COST_STATUSES)[number];

export const LANDED_COST_COMPONENT_TYPES = [
  'Freight',
  'Duty',
  'Customs',
  'Brokerage',
  'Insurance',
  'Port Charges',
  'Local Delivery',
  'Handling',
  'Other',
] as const;

export type LandedCostComponentType = (typeof LANDED_COST_COMPONENT_TYPES)[number];

export const ALLOCATION_METHODS = [
  'BY_PURCHASE_VALUE',
  'BY_QUANTITY',
  'BY_WEIGHT',
  'BY_VOLUME',
  'MANUAL',
] as const;

export type AllocationMethod = (typeof ALLOCATION_METHODS)[number];

export const MATERIAL_COST_SOURCE_TYPES = [
  'Purchase Receipt',
  'Landed Cost Adjustment',
  'Opening Cost',
  'Manual Cost Adjustment',
] as const;

export type MaterialCostSourceType = (typeof MATERIAL_COST_SOURCE_TYPES)[number];

export const LIQUID_COST_SOURCE_TYPES = [
  'Bulk Spirit Receipt',
  'Production Output',
  'Blend',
  'Proof Down',
  'Transfer',
  'Manual Cost Adjustment',
  'Opening Cost',
] as const;

export type LiquidCostSourceType = (typeof LIQUID_COST_SOURCE_TYPES)[number];

export const BATCH_SNAPSHOT_TYPES = ['Preliminary', 'Final'] as const;
export type BatchSnapshotType = (typeof BATCH_SNAPSHOT_TYPES)[number];

export const CONVERSION_COST_TYPES = [
  'Labor',
  'Utilities',
  'Fuel',
  'External Service',
  'Production Supplies',
  'Overhead',
  'Other',
] as const;

export type ConversionCostType = (typeof CONVERSION_COST_TYPES)[number];

export const COST_ADJUSTMENT_TARGETS = [
  'Material Lot',
  'Liquid Lot',
  'Production Batch',
  'Finished Output',
] as const;

export type CostAdjustmentTarget = (typeof COST_ADJUSTMENT_TARGETS)[number];

export const PRODUCTION_OUTPUT_TYPES = [
  'Liquid Lot',
  'Finished SKU',
  'By-product',
  'Other',
] as const;

export type ProductionOutputType = (typeof PRODUCTION_OUTPUT_TYPES)[number];

/** Decimal places for internal monetary scale (6 = micro-KYD). */
export const MONEY_SCALE = 6;

/** Display precision for currency totals. */
export const CURRENCY_DISPLAY_SCALE = 2;

/** Tolerance for allocation total matching (in KYD). */
export const ALLOCATION_TOLERANCE = 0.000001;
