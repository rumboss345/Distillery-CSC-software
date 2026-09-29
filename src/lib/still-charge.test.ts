import { describe, expect, it } from 'vitest';
import {
  chargeExceedsStillCapacity,
  plannedRecordSkipsEquipmentStatus,
  runConsumesSource,
  fermenterChargeSkipsCleaningGate,
  stillAlreadyOccupiedMessage,
  stillChargeCapacityMessage,
  stillRunOccupiesEquipment,
} from './still-charge';

describe('still-charge', () => {
  it('detects charge volume over still capacity', () => {
    expect(chargeExceedsStillCapacity(200, 200)).toBe(false);
    expect(chargeExceedsStillCapacity(200.1, 200)).toBe(true);
    expect(chargeExceedsStillCapacity(50, 0)).toBe(false);
    expect(chargeExceedsStillCapacity(0, 200)).toBe(false);
  });

  it('formats capacity error message', () => {
    expect(stillChargeCapacityMessage(250, 'Pot Still #1', 200)).toBe(
      'Charge volume (250 gal) exceeds Pot Still #1 capacity (200 gal).',
    );
  });

  it('lets a planned run ignore equipment status', () => {
    expect(plannedRecordSkipsEquipmentStatus('planned')).toBe(true);
    expect(plannedRecordSkipsEquipmentStatus('running')).toBe(false);
    expect(plannedRecordSkipsEquipmentStatus('mashing')).toBe(false);
    expect(stillRunOccupiesEquipment('planned')).toBe(false);
    expect(stillRunOccupiesEquipment('running')).toBe(true);
    expect(runConsumesSource('planned')).toBe(false);
    expect(runConsumesSource('running')).toBe(true);
    expect(runConsumesSource('complete')).toBe(true);
  });

  it('lets a charged fermenter stay dirty while the distillation is completed', () => {
    expect(fermenterChargeSkipsCleaningGate('running', 4, 4)).toBe(true);
    expect(fermenterChargeSkipsCleaningGate('complete', 4, 4)).toBe(true);
    expect(fermenterChargeSkipsCleaningGate('planned', 4, 4)).toBe(false);
    expect(fermenterChargeSkipsCleaningGate('running', 4, 5)).toBe(false);
    expect(fermenterChargeSkipsCleaningGate(null, 4, 4)).toBe(false);
  });

  it('formats still occupied error message', () => {
    expect(stillAlreadyOccupiedMessage('Vendome', 'D-2026-001', 'running', 800)).toBe(
      'Vendome is already in use by run D-2026-001 (running) with 800.0 gal charged. Complete that run or choose another still before charging again.',
    );
  });
});
