import { describe, expect, it } from 'vitest';
import {
  CLEANING_OVERDUE_FLASH_DAYS,
  calendarDaysBetweenInclusiveStart,
  equipmentCleaningDaysDirty,
  equipmentCleaningOverdueFlash,
} from './equipment-cleaning';

describe('equipment cleaning overdue', () => {
  it('counts calendar days since flagged', () => {
    expect(equipmentCleaningDaysDirty('2026-11-01T08:00:00', '2026-11-01')).toBe(0);
    expect(equipmentCleaningDaysDirty('2026-11-01T08:00:00', '2026-11-03')).toBe(2);
    expect(equipmentCleaningDaysDirty('2026-11-01T08:00:00', '2026-11-04')).toBe(3);
  });

  it('flashes after more than two days dirty', () => {
    expect(equipmentCleaningOverdueFlash(CLEANING_OVERDUE_FLASH_DAYS)).toBe(false);
    expect(equipmentCleaningOverdueFlash(CLEANING_OVERDUE_FLASH_DAYS + 1)).toBe(true);
  });

  it('measures inclusive calendar span', () => {
    expect(calendarDaysBetweenInclusiveStart('2026-11-01', '2026-11-04')).toBe(3);
  });
});
