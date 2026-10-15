import type { CalendarEvent } from './calendar-events';
import { localCalendarDayKey } from './date-input';
import { equipmentTypeLabel } from './equipment';

/** Wash tanks, holding tanks, stillage tanks, and collection vessels. */
const TANK_EQUIPMENT_TYPES = new Set([
  'mash_tun',
  'holding_tank',
  'stillage_tank',
  'collection_vessel',
]);

export function isTankEquipmentType(type: string): boolean {
  return TANK_EQUIPMENT_TYPES.has(type);
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
    status: done ? 'complete' : 'cleaning',
    statusCategory: done ? 'complete' : 'in_progress',
    assignee: done && recordedBy ? recordedBy : undefined,
    detail: done ? `${typeLabel} · Cleaned` : `${typeLabel} · Needs cleaning`,
  };
}

/**
 * Tank cleaning for one staff-sheet day.
 * A tank that still needs cleaning stays on the sheet from the day it was emptied through today.
 * A tank cleaned on this day is listed for the person who cleaned it.
 */
export function tankCleaningStaffEvents(
  rows: TankCleaningLogRow[],
  day: string,
  today: string,
): CalendarEvent[] {
  if (!day) return [];
  const tanks = rows.filter((row) => isTankEquipmentType(row.equipmentType));
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
    for (const log of ordered) {
      if (log.eventType === 'needs_cleaning') {
        if (!open) open = log;
        continue;
      }
      const cleanDay = localCalendarDayKey(log.createdAt);
      if (cleanDay === day) events.push(cleaningEvent(log, day, true));
      if (open) {
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
