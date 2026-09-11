/**
 * Phase 1L Equipment Maintenance, PM & Downtime.
 */
import type { SqlValue } from 'sql.js/dist/sql-wasm.js';
import type {
  CalibrationDueStatus,
  PmDueStatus,
  PmFrequencyUnit,
} from '../../shared/maintenance/constants';
import type {
  CreateDowntimeInput,
  CreatePmScheduleInput,
  CreateWorkOrderInput,
  DuePmWorkItem,
  EquipmentCalibrationStatus,
  EquipmentMaintenanceProfile,
  MaintDowntimeRecord,
  MaintPmSchedule,
  MaintWorkOrder,
  MaintenanceDashboardSummary,
  UpdateEquipmentMaintenanceInput,
} from '../types/maintenance';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import { nextBusinessCode } from './master-data-queries';

export { type EquipmentMaintenanceProfile } from '../types/maintenance';

const now = () => new Date().toISOString();

function todayIsoDate(): string {
  return now().slice(0, 10);
}

function parseIsoDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

/** Add frequency interval to a date (calendar days/weeks/months). */
export function addFrequencyToDate(
  fromDate: string,
  frequencyValue: number,
  frequencyUnit: PmFrequencyUnit,
): string {
  const d = parseIsoDate(fromDate);
  if (frequencyUnit === 'days') {
    d.setUTCDate(d.getUTCDate() + frequencyValue);
  } else if (frequencyUnit === 'weeks') {
    d.setUTCDate(d.getUTCDate() + frequencyValue * 7);
  } else {
    d.setUTCMonth(d.getUTCMonth() + frequencyValue);
  }
  return d.toISOString().slice(0, 10);
}

export function computePmDueStatus(
  nextDueDate: string | null,
  asOfDate: string = todayIsoDate(),
): PmDueStatus {
  if (!nextDueDate) return 'Current';
  const due = nextDueDate.slice(0, 10);
  const today = asOfDate.slice(0, 10);
  if (due < today) return 'Overdue';
  if (due === today) return 'Due';
  return 'Current';
}

export function computeCalibrationDueStatus(
  nextCalibrationDue: string | null,
  asOfDate: string = todayIsoDate(),
): CalibrationDueStatus {
  if (!nextCalibrationDue) return 'Current';
  const due = nextCalibrationDue.slice(0, 10);
  const today = asOfDate.slice(0, 10);
  if (due < today) return 'Overdue';
  if (due === today) return 'Due';
  return 'Current';
}

export function computeDowntimeDurationHours(
  startedAt: string,
  endedAt: string | null,
): number | null {
  if (!endedAt) return null;
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return Math.round(((endMs - startMs) / 3_600_000) * 100) / 100;
}

function getEquipmentOrThrow(equipmentId: number): EquipmentMaintenanceProfile {
  const row = getEquipmentMaintenanceProfile(equipmentId);
  if (!row) throw new Error('Equipment not found.');
  return row;
}

export function listEquipmentMaintenanceProfiles(): EquipmentMaintenanceProfile[] {
  return queryAll<EquipmentMaintenanceProfile>(
    `SELECT id, floor_plan_id, name, equipment_type, capacity_gal, status, notes,
            asset_number, manufacturer, model, serial_number, commission_date,
            criticality, maint_status, service_provider,
            last_calibration_date, next_calibration_due, calibration_certificate_ref, created_at
     FROM floor_equipment
     ORDER BY name`,
  );
}

export function getEquipmentMaintenanceProfile(id: number): EquipmentMaintenanceProfile | null {
  return queryOne<EquipmentMaintenanceProfile>(
    `SELECT id, floor_plan_id, name, equipment_type, capacity_gal, status, notes,
            asset_number, manufacturer, model, serial_number, commission_date,
            criticality, maint_status, service_provider,
            last_calibration_date, next_calibration_due, calibration_certificate_ref, created_at
     FROM floor_equipment WHERE id = ?`,
    [id],
  );
}

export function updateEquipmentMaintenance(input: UpdateEquipmentMaintenanceInput): void {
  getEquipmentOrThrow(input.equipmentId);
  runQuery(
    `UPDATE floor_equipment SET
      asset_number = ?,
      manufacturer = ?,
      model = ?,
      serial_number = ?,
      commission_date = ?,
      criticality = ?,
      maint_status = ?,
      service_provider = ?,
      last_calibration_date = ?,
      next_calibration_due = ?,
      calibration_certificate_ref = ?
     WHERE id = ?`,
    [
      input.assetNumber ?? null,
      input.manufacturer ?? null,
      input.model ?? null,
      input.serialNumber ?? null,
      input.commissionDate ?? null,
      input.criticality ?? null,
      input.maintStatus ?? 'Active',
      input.serviceProvider ?? null,
      input.lastCalibrationDate ?? null,
      input.nextCalibrationDue ?? null,
      input.calibrationCertificateRef ?? null,
      input.equipmentId,
    ],
  );
}

export function createWorkOrder(input: CreateWorkOrderInput): number {
  getEquipmentOrThrow(input.floorEquipmentId);
  const code = nextBusinessCode('mwo', 'maint_work_orders', 'work_order_code');
  const ts = now();
  return insertRow(
    `INSERT INTO maint_work_orders (
      work_order_code, floor_equipment_id, pm_schedule_id, work_type, status,
      title, description, scheduled_date, assigned_to, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.floorEquipmentId,
      input.pmScheduleId ?? null,
      input.workType,
      input.status ?? 'Open',
      input.title,
      input.description ?? '',
      input.scheduledDate ?? null,
      input.assignedTo ?? null,
      input.notes ?? '',
      ts,
      ts,
    ],
  );
}

export function getWorkOrder(id: number): MaintWorkOrder | null {
  return queryOne<MaintWorkOrder>(
    `SELECT wo.*, fe.name AS equipment_name
     FROM maint_work_orders wo
     JOIN floor_equipment fe ON fe.id = wo.floor_equipment_id
     WHERE wo.id = ?`,
    [id],
  );
}

export function listWorkOrders(filters?: { status?: string; equipmentId?: number }): MaintWorkOrder[] {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (filters?.status) {
    clauses.push('wo.status = ?');
    params.push(filters.status);
  }
  if (filters?.equipmentId != null) {
    clauses.push('wo.floor_equipment_id = ?');
    params.push(filters.equipmentId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<MaintWorkOrder>(
    `SELECT wo.*, fe.name AS equipment_name
     FROM maint_work_orders wo
     JOIN floor_equipment fe ON fe.id = wo.floor_equipment_id
     ${where}
     ORDER BY wo.created_at DESC`,
    params,
  );
}

export function updateWorkOrderStatus(
  workOrderId: number,
  status: MaintWorkOrder['status'],
  options?: { startedAt?: string; completedAt?: string },
): void {
  withDatabaseTransaction(() => {
    const wo = queryOne<MaintWorkOrder>('SELECT * FROM maint_work_orders WHERE id = ?', [workOrderId]);
    if (!wo) throw new Error('Work order not found.');
    if (wo.status === 'Completed' || wo.status === 'Cancelled') {
      throw new Error(`Cannot change status of ${wo.status.toLowerCase()} work order.`);
    }

    const ts = now();
    let startedAt = wo.started_at;
    let completedAt = wo.completed_at;
    if (status === 'In Progress' && !startedAt) {
      startedAt = options?.startedAt ?? ts;
    }
    if (status === 'Completed') {
      if (!startedAt) startedAt = options?.startedAt ?? ts;
      completedAt = options?.completedAt ?? ts;
      completeWorkOrderSideEffects(wo, completedAt);
    }

    runQuery(
      `UPDATE maint_work_orders SET status = ?, started_at = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      [status, startedAt, completedAt, ts, workOrderId],
    );
  });
}

function completeWorkOrderSideEffects(wo: MaintWorkOrder, completedAt: string): void {
  if (wo.pm_schedule_id != null) {
    const schedule = queryOne<MaintPmSchedule>(
      'SELECT * FROM maint_pm_schedules WHERE id = ?',
      [wo.pm_schedule_id],
    );
    if (schedule) {
      const completedDate = completedAt.slice(0, 10);
      const nextDue = addFrequencyToDate(
        completedDate,
        schedule.frequency_value,
        schedule.frequency_unit,
      );
      runQuery(
        `UPDATE maint_pm_schedules SET last_completed_date = ?, next_due_date = ?, updated_at = ? WHERE id = ?`,
        [completedDate, nextDue, now(), schedule.id],
      );
    }
  }

  if (wo.work_type === 'Calibration') {
    const completedDate = completedAt.slice(0, 10);
    const nextDue = addFrequencyToDate(completedDate, 12, 'months');
    runQuery(
      `UPDATE floor_equipment SET last_calibration_date = ?, next_calibration_due = ? WHERE id = ?`,
      [completedDate, nextDue, wo.floor_equipment_id],
    );
  }
}

export function completeWorkOrder(workOrderId: number, completedAt?: string): void {
  updateWorkOrderStatus(workOrderId, 'Completed', { completedAt: completedAt ?? now() });
}

export function createPmSchedule(input: CreatePmScheduleInput): number {
  getEquipmentOrThrow(input.floorEquipmentId);
  if (input.frequencyValue <= 0) throw new Error('Frequency value must be positive.');
  const code = nextBusinessCode('pmSchedule', 'maint_pm_schedules', 'schedule_code');
  const ts = now();
  const nextDue =
    input.nextDueDate ??
    addFrequencyToDate(todayIsoDate(), input.frequencyValue, input.frequencyUnit);
  return insertRow(
    `INSERT INTO maint_pm_schedules (
      schedule_code, floor_equipment_id, name, description, work_type,
      frequency_value, frequency_unit, next_due_date, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      code,
      input.floorEquipmentId,
      input.name,
      input.description ?? '',
      input.workType ?? 'Preventive',
      input.frequencyValue,
      input.frequencyUnit,
      nextDue,
      ts,
      ts,
    ],
  );
}

export function getPmSchedule(id: number): MaintPmSchedule | null {
  const row = queryOne<MaintPmSchedule>(
    `SELECT ps.*, fe.name AS equipment_name
     FROM maint_pm_schedules ps
     JOIN floor_equipment fe ON fe.id = ps.floor_equipment_id
     WHERE ps.id = ?`,
    [id],
  );
  if (!row) return null;
  return { ...row, due_status: computePmDueStatus(row.next_due_date) };
}

export function listPmSchedules(activeOnly = false): MaintPmSchedule[] {
  const where = activeOnly ? 'WHERE ps.active = 1' : '';
  const rows = queryAll<MaintPmSchedule>(
    `SELECT ps.*, fe.name AS equipment_name
     FROM maint_pm_schedules ps
     JOIN floor_equipment fe ON fe.id = ps.floor_equipment_id
     ${where}
     ORDER BY ps.next_due_date ASC, ps.name`,
  );
  return rows.map((row) => ({ ...row, due_status: computePmDueStatus(row.next_due_date) }));
}

export function listDuePmSchedules(asOfDate: string = todayIsoDate()): DuePmWorkItem[] {
  const schedules = listPmSchedules(true);
  return schedules
    .filter((s) => {
      const status = computePmDueStatus(s.next_due_date, asOfDate);
      return status === 'Due' || status === 'Overdue';
    })
    .map((schedule) => ({
      schedule,
      dueStatus: computePmDueStatus(schedule.next_due_date, asOfDate),
    }));
}

export function generateDuePmWorkOrders(asOfDate: string = todayIsoDate()): number[] {
  return withDatabaseTransaction(() => {
    const dueItems = listDuePmSchedules(asOfDate);
    const createdIds: number[] = [];
    for (const item of dueItems) {
      const existing = queryOne<{ id: number }>(
        `SELECT id FROM maint_work_orders
         WHERE pm_schedule_id = ? AND status NOT IN ('Completed', 'Cancelled')
         LIMIT 1`,
        [item.schedule.id],
      );
      if (existing) continue;
      const id = createWorkOrder({
        floorEquipmentId: item.schedule.floor_equipment_id,
        workType: item.schedule.work_type,
        title: `PM: ${item.schedule.name}`,
        description: item.schedule.description,
        scheduledDate: item.schedule.next_due_date,
        pmScheduleId: item.schedule.id,
        status: item.dueStatus === 'Overdue' ? 'Open' : 'Scheduled',
      });
      createdIds.push(id);
    }
    return createdIds;
  });
}

export function createDowntimeRecord(input: CreateDowntimeInput): number {
  getEquipmentOrThrow(input.floorEquipmentId);
  const code = nextBusinessCode('downtime', 'maint_downtime_records', 'downtime_code');
  return insertRow(
    `INSERT INTO maint_downtime_records (
      downtime_code, floor_equipment_id, work_order_id, started_at, ended_at,
      reason, production_impact, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.floorEquipmentId,
      input.workOrderId ?? null,
      input.startedAt,
      input.endedAt ?? null,
      input.reason,
      input.productionImpact ?? 'None',
      input.notes ?? '',
      now(),
    ],
  );
}

export function endDowntimeRecord(downtimeId: number, endedAt?: string): void {
  const row = queryOne<MaintDowntimeRecord>('SELECT * FROM maint_downtime_records WHERE id = ?', [downtimeId]);
  if (!row) throw new Error('Downtime record not found.');
  if (row.ended_at) throw new Error('Downtime already ended.');
  runQuery('UPDATE maint_downtime_records SET ended_at = ? WHERE id = ?', [endedAt ?? now(), downtimeId]);
}

export function listDowntimeRecords(filters?: { equipmentId?: number; activeOnly?: boolean }): MaintDowntimeRecord[] {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (filters?.equipmentId != null) {
    clauses.push('d.floor_equipment_id = ?');
    params.push(filters.equipmentId);
  }
  if (filters?.activeOnly) {
    clauses.push('d.ended_at IS NULL');
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = queryAll<MaintDowntimeRecord>(
    `SELECT d.*, fe.name AS equipment_name
     FROM maint_downtime_records d
     JOIN floor_equipment fe ON fe.id = d.floor_equipment_id
     ${where}
     ORDER BY d.started_at DESC`,
    params,
  );
  return rows.map((row) => ({
    ...row,
    duration_hours: computeDowntimeDurationHours(row.started_at, row.ended_at),
  }));
}

export function listCalibrationStatuses(asOfDate: string = todayIsoDate()): EquipmentCalibrationStatus[] {
  const rows = listEquipmentMaintenanceProfiles().filter(
    (e) => e.next_calibration_due != null || e.last_calibration_date != null,
  );
  return rows.map((e) => ({
    equipmentId: e.id,
    equipmentName: e.name,
    lastCalibrationDate: e.last_calibration_date,
    nextCalibrationDue: e.next_calibration_due,
    calibrationCertificateRef: e.calibration_certificate_ref,
    dueStatus: computeCalibrationDueStatus(e.next_calibration_due, asOfDate),
  }));
}

export function listOverdueCalibrations(asOfDate: string = todayIsoDate()): EquipmentCalibrationStatus[] {
  return listCalibrationStatuses(asOfDate).filter((c) => c.dueStatus === 'Overdue');
}

export function getMaintenanceDashboardSummary(): MaintenanceDashboardSummary {
  const totalEquipment = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM floor_equipment')?.count ?? 0;
  const openWorkOrders =
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM maint_work_orders WHERE status IN ('Open', 'Scheduled', 'In Progress')`,
    )?.count ?? 0;
  const overduePmSchedules = listDuePmSchedules().filter((d) => d.dueStatus === 'Overdue').length;
  const activeDowntime =
    queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM maint_downtime_records WHERE ended_at IS NULL')
      ?.count ?? 0;
  const overdueCalibrations = listOverdueCalibrations().length;
  return {
    totalEquipment,
    openWorkOrders,
    overduePmSchedules,
    activeDowntime,
    overdueCalibrations,
  };
}
