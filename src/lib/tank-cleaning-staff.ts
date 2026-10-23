import { eventOccursOnDate, type CalendarEvent } from './calendar-events';
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

function previousIsoDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year, (month || 1) - 1, date || 1);
  value.setDate(value.getDate() - 1);
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${mm}-${dd}`;
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
 * Cleaning spans for the calendar.
 * Equipment that still needs cleaning stays Upcoming on every day from the day it was emptied until it is cleaned.
 * The day it is cleaned is Done for the person who cleaned it.
 * Cleaning is never In progress. Tanks, collection vessels, fermenters, and stills are included.
 */
export function tankCleaningCalendarEvents(rows: TankCleaningLogRow[]): CalendarEvent[] {
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
      if (stillDirty || !cleanDay) continue;
      events.push(cleaningEvent(log, cleanDay, true));
      if (open) {
        const start = localCalendarDayKey(open.createdAt);
        if (start && start < cleanDay) {
          const end = previousIsoDay(cleanDay);
          events.push({
            ...cleaningEvent(open, start, false),
            endDate: end === start ? undefined : end,
          });
        }
        open = null;
      }
    }
    if (open && open.status === 'cleaning') {
      const start = localCalendarDayKey(open.createdAt);
      if (start) {
        events.push({
          ...cleaningEvent(open, start, false),
          continuesUntilCleaned: true,
        });
      }
    }
  }

  return events.sort((a, b) => a.title.localeCompare(b.title) || a.startDate.localeCompare(b.startDate));
}

/** Cleaning rows for one calendar day. Dirty equipment stays Upcoming on later days until it is cleaned. */
export function tankCleaningStaffEvents(
  rows: TankCleaningLogRow[],
  day: string,
): CalendarEvent[] {
  if (!day) return [];
  return tankCleaningCalendarEvents(rows)
    .filter((event) => eventOccursOnDate(event, day))
    .sort((a, b) => a.title.localeCompare(b.title));
}
