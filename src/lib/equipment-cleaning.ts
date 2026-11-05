import type { FloorEquipment } from '../types';
import { isIsoDate, localCalendarDayKey } from './date-input';

/** Flash equipment that has stayed in “needs cleaning” longer than this many calendar days. */
export const CLEANING_OVERDUE_FLASH_DAYS = 2;

/**
 * Equipment that stays on the calendar while it needs cleaning:
 * tanks, collection vessels, fermenters, and stills.
 */
export const CALENDAR_CLEANING_EQUIPMENT_TYPES = [
  'mash_tun',
  'holding_tank',
  'stillage_tank',
  'collection_vessel',
  'fermenter',
  'pot_still',
  'column_still',
] as const;

/** Equipment emptied after use — must be marked clean before the next batch. */
export function equipmentNeedsCleaning(item: Pick<FloorEquipment, 'status'>): boolean {
  return item.status === 'cleaning';
}

export function equipmentCleaningStatusLabel(): string {
  return 'Needs cleaning';
}

/**
 * Putting a record back to planned cancels the use.
 * An in-use or cleaning hold is released; liquid that is still there stays in use.
 * Returns null when the status should be left alone.
 */
export function equipmentStatusWhenReturningToPlanned(
  status: string,
  hasContents: boolean,
): 'empty' | 'in_use' | null {
  if (status !== 'in_use' && status !== 'cleaning') return null;
  return hasContents ? 'in_use' : 'empty';
}

export function calendarDaysBetweenInclusiveStart(startDay: string, endDay: string): number {
  if (!isIsoDate(startDay) || !isIsoDate(endDay) || endDay < startDay) return 0;
  const [sy, sm, sd] = startDay.split('-').map(Number);
  const [ey, em, ed] = endDay.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}

/** Whole calendar days since the equipment was flagged needs cleaning (flag day = 0). */
export function equipmentCleaningDaysDirty(
  needsCleaningFlaggedAt: string | null | undefined,
  today: string,
): number {
  const start = localCalendarDayKey(needsCleaningFlaggedAt);
  if (!start || !isIsoDate(today)) return 0;
  return calendarDaysBetweenInclusiveStart(start, today);
}

export function equipmentCleaningOverdueFlash(daysDirty: number): boolean {
  return daysDirty > CLEANING_OVERDUE_FLASH_DAYS;
}
