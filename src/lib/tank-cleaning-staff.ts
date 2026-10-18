import type { CalendarEvent } from './calendar-events';
import { localCalendarDayKey } from './date-input';
import { equipmentTypeLabel } from './equipment';
import { CALENDAR_CLEANING_EQUIPMENT_TYPES } from './equipment-cleaning';

const CALENDAR_CLEANING_EQUIPMENT_TYPE_SET = new Set<string>(CALENDAR_CLEANING_EQUIPMENT_TYPES);

export function showsCleaningOnCalendar(type: string): boolean {
  return CALENDAR_CLEANING_EQUIPMENT_TYPE_SET.has(type);
}

export interface TankCleaningLogRow {
  id: number;
  equipmentId: number;
  equipmentName: string;
  equipmentType: string;
  eventType: 'needs_cleaning' | 'marked_cleaned';
  createdAt: string;
  recordedBy: string;
  /** Current equipment status. */
  status: string;
}

function byTime(a: TankCleaningLogRow, b: TankCleaningLogRow): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id - b.id;
}

function cleaningEvent(
  row: TankCleaningLogRow,
  day: string,
  done: boolean,
): CalendarEvent {
  const typeLabel = equipmentTypeLabel(row.equipmentType);
  const recordedBy = row.recordedBy.trim();
  return {
    id: done ? `tank-cleaned-${row.id}` : `tank-cleaning-${row.id}`,
    recordId: row.equipmentId,
    startDate: day,
    allDay: true,
    kind: 'cleaning',
    title: row.equipmentName,
    status: done ? 'done' : 'upcoming',
    statusCategory: done ? 'complete' : 'planned',
    assignee: done && recordedBy ? recordedBy : undefined,
    detail: done ? `${typeLabel} · Cleaned` : `${typeLabel} · Needs cleaning`,
  };
}

/**
 * Cleaning for one staff-sheet day.
 * Equipment that still needs cleaning stays on the sheet from the day it was emptied through today, with status Upcoming.
 * Equipment marked cleaned on this day is Done for the person who cleaned it.
 * Cleaning is never In progress. Tanks, collection vessels, fermenters, and stills are included.
 */
export function tankCleaningStaffEvents(
  rows: TankCleaningLogRow[],
  day: string,
  today: string,
): CalendarEvent[] {
  if (!day) return [];
  const tanks = rows.filter((row) => showsCleaningOnCalendar(row.equipmentType));
  const byTank = new Map<number, TankCleaningLogRow[]>();
  for (const row of tanks) {
    const list = byTank.get(row.equipmentId) ?? [];
    list.push(row);
    byTank.set(row.equipmentId, list);
  }

  const events: CalendarEvent[] = [];
  for (const logs of byTank.values()) {
    const ordered = [...logs].sort(byTime);
    let open: TankCleaningLogRow | null = null;
    for (let index = 0; index < ordered.length; index += 1) {
      const log = ordered[index];
      if (log.eventType === 'needs_cleaning') {
        if (!open) open = log;
        continue;
      }
      const cleanedAgainLater = ordered.slice(index + 1).some((row) => row.eventType === 'needs_cleaning');
      // A clean log does not finish the job while the tank is still dirty.
      const stillDirty = log.status === 'cleaning' && !cleanedAgainLater;
      const cleanDay = localCalendarDayKey(log.createdAt);
      if (!stillDirty && cleanDay === day) events.push(cleaningEvent(log, day, true));
      if (open && !stillDirty) {
        const start = localCalendarDayKey(open.createdAt);
        if (start && cleanDay && start <= day && day < cleanDay) {
          events.push(cleaningEvent(open, day, false));
        }
        open = null;
      }
    }
    if (open && open.status === 'cleaning') {
      const start = localCalendarDayKey(open.createdAt);
      if (start && start <= day && day <= today) {
        events.push(cleaningEvent(open, day, false));
      }
    }
  }

  return events.sort((a, b) => a.title.localeCompare(b.title));
}
