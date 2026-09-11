import type {
  CalibrationDueStatus,
  DowntimeProductionImpact,
  EquipmentCriticality,
  EquipmentMaintStatus,
  MwoStatus,
  MwoWorkType,
  PmDueStatus,
  PmFrequencyUnit,
} from '../../shared/maintenance/constants';

export interface EquipmentMaintenanceProfile {
  id: number;
  floor_plan_id: number;
  name: string;
  equipment_type: string;
  capacity_gal: number;
  status: string;
  notes: string;
  asset_number: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  commission_date: string | null;
  criticality: EquipmentCriticality | null;
  maint_status: EquipmentMaintStatus | null;
  service_provider: string | null;
  last_calibration_date: string | null;
  next_calibration_due: string | null;
  calibration_certificate_ref: string | null;
  created_at: string;
}

export interface UpdateEquipmentMaintenanceInput {
  equipmentId: number;
  assetNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  commissionDate?: string | null;
  criticality?: EquipmentCriticality | null;
  maintStatus?: EquipmentMaintStatus | null;
  serviceProvider?: string | null;
  lastCalibrationDate?: string | null;
  nextCalibrationDue?: string | null;
  calibrationCertificateRef?: string | null;
}

export interface MaintWorkOrder {
  id: number;
  work_order_code: string;
  floor_equipment_id: number;
  equipment_name?: string;
  pm_schedule_id: number | null;
  work_type: MwoWorkType;
  status: MwoStatus;
  title: string;
  description: string;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkOrderInput {
  floorEquipmentId: number;
  workType: MwoWorkType;
  title: string;
  description?: string;
  scheduledDate?: string | null;
  pmScheduleId?: number | null;
  assignedTo?: string | null;
  status?: MwoStatus;
  notes?: string;
}

export interface MaintPmSchedule {
  id: number;
  schedule_code: string;
  floor_equipment_id: number;
  equipment_name?: string;
  name: string;
  description: string;
  work_type: MwoWorkType;
  frequency_value: number;
  frequency_unit: PmFrequencyUnit;
  last_completed_date: string | null;
  next_due_date: string | null;
  active: number;
  created_at: string;
  updated_at: string;
  due_status?: PmDueStatus;
}

export interface CreatePmScheduleInput {
  floorEquipmentId: number;
  name: string;
  description?: string;
  workType?: MwoWorkType;
  frequencyValue: number;
  frequencyUnit: PmFrequencyUnit;
  nextDueDate?: string | null;
}

export interface MaintDowntimeRecord {
  id: number;
  downtime_code: string;
  floor_equipment_id: number;
  equipment_name?: string;
  work_order_id: number | null;
  started_at: string;
  ended_at: string | null;
  reason: string;
  production_impact: DowntimeProductionImpact;
  notes: string;
  duration_hours?: number | null;
  created_at: string;
}

export interface CreateDowntimeInput {
  floorEquipmentId: number;
  startedAt: string;
  endedAt?: string | null;
  reason: string;
  productionImpact?: DowntimeProductionImpact;
  workOrderId?: number | null;
  notes?: string;
}

export interface MaintenanceDashboardSummary {
  totalEquipment: number;
  openWorkOrders: number;
  overduePmSchedules: number;
  activeDowntime: number;
  overdueCalibrations: number;
}

export interface DuePmWorkItem {
  schedule: MaintPmSchedule;
  dueStatus: PmDueStatus;
}

export interface EquipmentCalibrationStatus {
  equipmentId: number;
  equipmentName: string;
  lastCalibrationDate: string | null;
  nextCalibrationDue: string | null;
  calibrationCertificateRef: string | null;
  dueStatus: CalibrationDueStatus;
}
