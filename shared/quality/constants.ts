export const QC_SPEC_TYPES = ['SKU', 'RawMaterial', 'PackagingMaterial', 'Product', 'FinishedGoods'] as const;
export type QcSpecType = (typeof QC_SPEC_TYPES)[number];

export const QC_SPEC_STATUSES = ['Active', 'Inactive'] as const;
export type QcSpecStatus = (typeof QC_SPEC_STATUSES)[number];

export const QC_PARAMETER_TYPES = ['numeric', 'text', 'pass_fail'] as const;
export type QcParameterType = (typeof QC_PARAMETER_TYPES)[number];

export const QC_SAMPLE_TYPES = ['Incoming', 'InProcess', 'Finished', 'Retained'] as const;
export type QcSampleType = (typeof QC_SAMPLE_TYPES)[number];

export const QC_SAMPLE_STATUSES = ['Pending', 'In Testing', 'Complete', 'Cancelled'] as const;
export type QcSampleStatus = (typeof QC_SAMPLE_STATUSES)[number];

export const QC_HOLD_ENTITY_TYPES = ['mat_lot', 'liq_lot', 'fg_lot', 'prod_batch'] as const;
export type QcHoldEntityType = (typeof QC_HOLD_ENTITY_TYPES)[number];

export const QC_HOLD_STATUSES = ['Active', 'Released'] as const;
export type QcHoldStatus = (typeof QC_HOLD_STATUSES)[number];

export const QC_SOURCE_ENTITY_TYPES = ['mat_lot', 'liq_lot', 'fg_lot', 'prod_batch'] as const;
export type QcSourceEntityType = (typeof QC_SOURCE_ENTITY_TYPES)[number];

export const QC_RESULT_PASS_FAIL = ['Pass', 'Fail', 'N/A', 'Pending'] as const;
export type QcResultPassFail = (typeof QC_RESULT_PASS_FAIL)[number];

export const QC_COA_STATUSES = ['Draft', 'Issued'] as const;
export type QcCoaStatus = (typeof QC_COA_STATUSES)[number];

export const QC_RECALL_LEVELS = [
  'supplier_lot',
  'material_lot',
  'production_batch',
  'liquid_lot',
  'fg_lot',
] as const;
export type QcRecallLevel = (typeof QC_RECALL_LEVELS)[number];
