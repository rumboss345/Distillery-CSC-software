/** Phase 1F material inventory ledger constants. */

export const INVENTORY_TRACKING_MODES = ['LEGACY', 'LEDGER'] as const;
export type InventoryTrackingMode = typeof INVENTORY_TRACKING_MODES[number];

export const MATERIAL_TYPES = ['RAW_MATERIAL', 'PACKAGING_MATERIAL'] as const;
export type MaterialType = typeof MATERIAL_TYPES[number];

export const MAT_LOT_STATUSES = [
  'Active',
  'Quarantine',
  'Released',
  'Depleted',
  'Rejected',
  'Expired',
  'Inactive',
] as const;

/** Lots eligible for normal production issue (Phase 1F). */
export const ISSUEABLE_LOT_STATUSES = ['Active', 'Released'] as const;

/** Base units treated as discrete count — fractional base quantities rejected. */
export const DISCRETE_COUNT_UNITS = ['each', 'case', 'pallet', 'bag', 'drum', 'keg', 'tote'] as const;

export const LEGACY_RECEIPT_BLOCK_MESSAGE =
  'This material is still LEGACY-tracked. Activate ledger tracking and establish an opening balance before posting ledger inventory transactions.';

export const MAT_TRANSACTION_TYPES = [
  'Opening Balance',
  'Purchase Receipt',
  'Production Issue',
  'Production Return',
  'Location Transfer Out',
  'Location Transfer In',
  'Supplier Return',
  'Damage',
  'Breakage',
  'Spoilage',
  'Expiration',
  'Sampling',
  'Manual Adjustment Increase',
  'Manual Adjustment Decrease',
  'Cycle Count Adjustment',
  'Correction / Reversal',
] as const;

export const MAT_RECEIPT_STATUSES = ['Draft', 'Posted', 'Reversed'] as const;

export const MAT_RECONCILIATION_STATUSES = ['Draft', 'Posted'] as const;

export const MAT_SOURCE_DOCUMENT_TYPES = {
  PURCHASE_RECEIPT: 'purchase_receipt',
  PRODUCTION_BATCH: 'production_batch',
  RECONCILIATION: 'material_reconciliation',
} as const;

export const MAT_LOOKUP_TYPES = {
  LOSS_REASON: 'material_loss_reason',
} as const;

export const DEFAULT_MAT_LOSS_REASONS = [
  'Breakage',
  'Damage',
  'Spoilage',
  'Expiration',
  'Sampling',
  'Handling Loss',
  'Contamination',
  'Other',
] as const;
