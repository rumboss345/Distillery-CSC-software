/**
 * Phase 1L Equipment Maintenance, PM & Downtime.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Database } from 'sql.js/dist/sql-wasm.js';
import { __injectDatabaseForTests, queryOne } from '../../../src/db/database';
import {
  addFrequencyToDate,
  completeWorkOrder,
  computeCalibrationDueStatus,
  computeDowntimeDurationHours,
  computePmDueStatus,
  createDowntimeRecord,
  createPmSchedule,
  createWorkOrder,
  endDowntimeRecord,
  generateDuePmWorkOrders,
  getPmSchedule,
  listDuePmSchedules,
  listOverdueCalibrations,
  updateEquipmentMaintenance,
} from '../../../src/db/maintenance-queries';
import { teardownTestDb } from '../helpers/costing-test-helpers';
import { createMaintenanceTestDb, seedEquipmentId } from '../helpers/maintenance-test-helpers';

describe('Phase 1L Equipment Maintenance', () => {
  let db: Database;

  afterEach(() => {
    teardownTestDb();
  });

  async function setup(): Promise<number> {
    db = await createMaintenanceTestDb();
    __injectDatabaseForTests(db);
    return seedEquipmentId(db);
  }

  it('computes PM due status for current, due, and overdue schedules', async () => {
    await setup();
    assert.equal(computePmDueStatus('2026-09-20', '2026-09-11'), 'Current');
    assert.equal(computePmDueStatus('2026-09-11', '2026-09-11'), 'Due');
    assert.equal(computePmDueStatus('2026-09-01', '2026-09-11'), 'Overdue');
  });

  it('adds frequency intervals for next-due generation', async () => {
    await setup();
    assert.equal(addFrequencyToDate('2026-01-01', 30, 'days'), '2026-01-31');
    assert.equal(addFrequencyToDate('2026-01-01', 2, 'weeks'), '2026-01-15');
    assert.equal(addFrequencyToDate('2026-01-15', 3, 'months'), '2026-04-15');
  });

  it('lists due and overdue PM schedules', async () => {
    const equipmentId = await setup();
    createPmSchedule({
      floorEquipmentId: equipmentId,
      name: 'Monthly inspection',
      frequencyValue: 1,
      frequencyUnit: 'months',
      nextDueDate: '2026-09-01',
    });
    createPmSchedule({
      floorEquipmentId: equipmentId,
      name: 'Future task',
      frequencyValue: 1,
      frequencyUnit: 'months',
      nextDueDate: '2026-12-01',
    });
    const due = listDuePmSchedules('2026-09-11');
    assert.equal(due.length, 1);
    assert.equal(due[0]?.dueStatus, 'Overdue');
  });

  it('generates work orders from due PM schedules', async () => {
    const equipmentId = await setup();
    createPmSchedule({
      floorEquipmentId: equipmentId,
      name: 'Quarterly PM',
      frequencyValue: 3,
      frequencyUnit: 'months',
      nextDueDate: '2026-09-11',
    });
    const ids = generateDuePmWorkOrders('2026-09-11');
    assert.equal(ids.length, 1);
    const wo = queryOne<{ work_order_code: string; status: string; pm_schedule_id: number }>(
      'SELECT work_order_code, status, pm_schedule_id FROM maint_work_orders WHERE id = ?',
      [ids[0]],
    );
    assert.match(wo?.work_order_code ?? '', /^MWO-/);
    assert.equal(wo?.status, 'Scheduled');
    assert.ok(wo?.pm_schedule_id);
  });

  it('completes work order and advances PM next due date', async () => {
    const equipmentId = await setup();
    const scheduleId = createPmSchedule({
      floorEquipmentId: equipmentId,
      name: 'Weekly cleaning',
      frequencyValue: 1,
      frequencyUnit: 'weeks',
      nextDueDate: '2026-09-11',
    });
    const woId = createWorkOrder({
      floorEquipmentId: equipmentId,
      workType: 'Preventive',
      title: 'Weekly cleaning',
      pmScheduleId: scheduleId,
      status: 'In Progress',
    });
    completeWorkOrder(woId, '2026-09-11T14:00:00.000Z');
    const wo = queryOne<{ status: string; completed_at: string }>(
      'SELECT status, completed_at FROM maint_work_orders WHERE id = ?',
      [woId],
    );
    assert.equal(wo?.status, 'Completed');
    assert.ok(wo?.completed_at);
    const schedule = getPmSchedule(scheduleId);
    assert.equal(schedule?.last_completed_date, '2026-09-11');
    assert.equal(schedule?.next_due_date, '2026-09-18');
  });

  it('computes downtime duration in hours', async () => {
    await setup();
    const hours = computeDowntimeDurationHours(
      '2026-09-11T08:00:00.000Z',
      '2026-09-11T12:30:00.000Z',
    );
    assert.equal(hours, 4.5);
    assert.equal(
      computeDowntimeDurationHours('2026-09-11T08:00:00.000Z', null),
      null,
    );
  });

  it('records downtime and calculates duration on end', async () => {
    const equipmentId = await setup();
    const downtimeId = createDowntimeRecord({
      floorEquipmentId: equipmentId,
      startedAt: '2026-09-11T06:00:00.000Z',
      reason: 'Seal replacement',
      productionImpact: 'Partial',
    });
    endDowntimeRecord(downtimeId, '2026-09-11T10:00:00.000Z');
    const row = queryOne<{ ended_at: string }>(
      'SELECT ended_at FROM maint_downtime_records WHERE id = ?',
      [downtimeId],
    );
    assert.ok(row?.ended_at);
    const hours = computeDowntimeDurationHours('2026-09-11T06:00:00.000Z', row!.ended_at);
    assert.equal(hours, 4);
  });

  it('flags overdue calibration status', async () => {
    const equipmentId = await setup();
    updateEquipmentMaintenance({
      equipmentId,
      nextCalibrationDue: '2026-08-01',
      calibrationCertificateRef: 'CERT-1001',
    });
    assert.equal(computeCalibrationDueStatus('2026-08-01', '2026-09-11'), 'Overdue');
    const overdue = listOverdueCalibrations('2026-09-11');
    assert.equal(overdue.length, 1);
    assert.equal(overdue[0]?.equipmentId, equipmentId);
    assert.equal(overdue[0]?.calibrationCertificateRef, 'CERT-1001');
  });

  it('updates calibration dates when calibration work order completes', async () => {
    const equipmentId = await setup();
    const woId = createWorkOrder({
      floorEquipmentId: equipmentId,
      workType: 'Calibration',
      title: 'Annual scale calibration',
      status: 'In Progress',
    });
    completeWorkOrder(woId, '2026-09-11T16:00:00.000Z');
    const equipment = queryOne<{ last_calibration_date: string; next_calibration_due: string }>(
      'SELECT last_calibration_date, next_calibration_due FROM floor_equipment WHERE id = ?',
      [equipmentId],
    );
    assert.equal(equipment?.last_calibration_date, '2026-09-11');
    assert.equal(equipment?.next_calibration_due, '2027-09-11');
  });
});
