/** Phase 1E production order and batch status enums. */

export const PRODUCTION_ORDER_STATUSES = [
  'Draft',
  'Planned',
  'Released',
  'In Progress',
  'Completed',
  'Cancelled',
] as const;

export const PRODUCTION_BATCH_STATUSES = [
  'Ready',
  'In Progress',
  'Paused',
  'Completed',
  'Cancelled',
] as const;

export const PRODUCTION_TYPES = [
  'Fermentation',
  'Distillation',
  'Spirit Transfer',
  'Blending',
  'Proof Down',
  'Gin / Botanical',
  'RTD',
  'Bottling',
  'Canning',
  'Packaging',
  'Other',
] as const;

export const REQUIREMENT_TYPES = [
  'Raw Material',
  'Bulk Spirit',
  'Liquid Lot',
  'Water',
  'Packaging',
  'Other',
] as const;

export const BATCH_INPUT_TYPES = [
  'Raw Material',
  'Bulk Spirit',
  'Liquid Lot',
  'Water',
  'Packaging',
  'Other',
] as const;

export const LOSS_TYPES = [
  'Transfer Loss',
  'Processing Loss',
  'Evaporation',
  'Spill',
  'Sampling',
  'Packaging Loss',
  'Other',
] as const;

export const BATCH_STEP_STATUSES = [
  'Pending',
  'Completed',
  'Skipped',
] as const;

export const PRODUCTION_EVENT_TYPES = [
  'Order Created',
  'Order Updated',
  'Order Released',
  'Order Completed',
  'Order Cancelled',
  'Batch Created',
  'Batch Started',
  'Batch Paused',
  'Batch Resumed',
  'Input Recorded',
  'Loss Recorded',
  'Output Recorded',
  'Batch Completed',
  'Batch Cancelled',
] as const;

export const PRODUCTION_LOOKUP_TYPES = {
  PRODUCTION_TYPE: 'production_type',
} as const;

export const SOURCE_DOCUMENT_TYPES = {
  PRODUCTION_ORDER: 'production_order',
  PRODUCTION_BATCH: 'production_batch',
} as const;

export const MATERIAL_INVENTORY_PENDING_MESSAGE =
  'Usage recorded for production execution. Inventory quantity posting will be enabled when the material inventory ledger is implemented.';
