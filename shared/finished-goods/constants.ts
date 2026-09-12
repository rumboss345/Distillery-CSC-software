export const PKG_RUN_STATUSES = [
  'Draft',
  'Ready',
  'In Progress',
  'Paused',
  'Completed',
  'Cancelled',
] as const;

export type PkgRunStatus = (typeof PKG_RUN_STATUSES)[number];

export const FG_LOT_STATUSES = [
  'Available',
  'Hold',
  'Released',
  'Blocked',
  'Depleted',
  'Recalled',
  'Inactive',
] as const;

export type FgLotStatus = (typeof FG_LOT_STATUSES)[number];

export const FG_QUALITY_STATUSES = ['Pending', 'Passed', 'Failed', 'Hold'] as const;

export const FG_TRANSACTION_TYPES = [
  'Opening Balance',
  'Production Receipt',
  'Transfer Out',
  'Transfer In',
  'Shipment',
  'Sale',
  'Sample',
  'Promotion',
  'Damage',
  'Breakage',
  'Write-Off',
  'Return',
  'Adjustment',
  'Reconciliation',
  'Reversal',
] as const;

export type FgTransactionType = (typeof FG_TRANSACTION_TYPES)[number];

export const FG_COST_STATUSES = ['UNVALUED', 'VALUED', 'PARTIALLY_VALUED'] as const;
