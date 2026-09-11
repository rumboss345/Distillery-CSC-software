/** Phase 1D liquid ledger — transaction types, lot types, tank types, tracking modes. */

export const TRACKING_MODES = ['LEGACY', 'LEDGER'] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];

export const DEFAULT_LOT_TYPES = [
  'Purchased Bulk Spirit',
  'Distillate',
  'Low Wines',
  'Hearts',
  'Heads',
  'Tails',
  'Finished Spirit',
  'Blend',
  'Proofed Spirit',
  'Gin Base',
  'RTD Base',
  'Experimental',
  'Other',
] as const;

export const DEFAULT_TANK_TYPES = [
  'Fermenter',
  'Low Wines',
  'Spirit Holding',
  'Blend Tank',
  'Proofing Tank',
  'Finished Spirit',
  'Gin',
  'RTD',
  'Temporary',
  'Other',
] as const;

export const TRANSACTION_TYPES = [
  'Opening Balance',
  'Bulk Spirit Receipt',
  'Distillation Output',
  'Tank Transfer Out',
  'Tank Transfer In',
  'Blend Consumption',
  'Blend Production',
  'Proof Down Consumption',
  'Proof Down Water Addition',
  'Proof Down Production',
  'Bottling Withdrawal',
  'Process Loss',
  'Evaporation Loss',
  'Spill / Damage',
  'Sampling',
  'Manual Adjustment Increase',
  'Manual Adjustment Decrease',
  'Correction / Reversal',
  'Barrel Fill Withdrawal',
  'Barrel Dump Receipt',
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const LOSS_REASON_CODES = [
  'Evaporation',
  'Transfer Loss',
  'Processing Loss',
  'Spill',
  'Sampling',
  'Measurement Correction',
  'Other',
] as const;

export const LIQ_LOOKUP_TYPES = {
  LOT_TYPE: 'lot_type',
  TANK_TYPE: 'tank_type',
  LOSS_REASON: 'loss_reason',
} as const;

export const LOT_STATUSES = ['Active', 'Depleted', 'Archived'] as const;
export const TANK_STATUSES = ['Active', 'Inactive', 'Maintenance'] as const;
