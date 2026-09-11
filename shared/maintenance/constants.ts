export const EQUIPMENT_CRITICALITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type EquipmentCriticality = (typeof EQUIPMENT_CRITICALITIES)[number];

/** Maintenance registry status — distinct from floor production status (empty/in_use). */
export const EQUIPMENT_MAINT_STATUSES = ['Active', 'Inactive', 'Out of Service', 'Decommissioned'] as const;
export type EquipmentMaintStatus = (typeof EQUIPMENT_MAINT_STATUSES)[number];

export const MWO_WORK_TYPES = [
  'Preventive',
  'Corrective',
  'Inspection',
  'Calibration',
  'Cleaning',
  'Other',
] as const;
export type MwoWorkType = (typeof MWO_WORK_TYPES)[number];

export const MWO_STATUSES = ['Open', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'] as const;
export type MwoStatus = (typeof MWO_STATUSES)[number];

export const PM_FREQUENCY_UNITS = ['days', 'weeks', 'months'] as const;
export type PmFrequencyUnit = (typeof PM_FREQUENCY_UNITS)[number];

export const DOWNTIME_PRODUCTION_IMPACTS = ['None', 'Partial', 'Full'] as const;
export type DowntimeProductionImpact = (typeof DOWNTIME_PRODUCTION_IMPACTS)[number];

export const PM_DUE_STATUSES = ['Current', 'Due', 'Overdue'] as const;
export type PmDueStatus = (typeof PM_DUE_STATUSES)[number];

export const CALIBRATION_DUE_STATUSES = ['Current', 'Due', 'Overdue'] as const;
export type CalibrationDueStatus = (typeof CALIBRATION_DUE_STATUSES)[number];
