import type { CalendarActivityKind, CalendarEvent } from './calendar-events';

export const UNASSIGNED_STAFF_LABEL = 'Unassigned';

const KIND_ORDER: CalendarActivityKind[] = [
  'wash',
  'fermentation',
  'distillation',
  'bottling',
  'blend',
];

export interface StaffDayGroup {
  name: string;
  events: CalendarEvent[];
}

function staffName(event: CalendarEvent): string {
  const name = event.assignee?.trim();
  return name || UNASSIGNED_STAFF_LABEL;
}

function kindRank(kind: CalendarActivityKind): number {
  const index = KIND_ORDER.indexOf(kind);
  return index === -1 ? KIND_ORDER.length : index;
}

/** One day's work, grouped by the person assigned to it. Unassigned work is last. */
export function groupEventsByStaff(events: CalendarEvent[]): StaffDayGroup[] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const name = staffName(event);
    const list = groups.get(name) ?? [];
    list.push(event);
    groups.set(name, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === UNASSIGNED_STAFF_LABEL) return 1;
      if (b === UNASSIGNED_STAFF_LABEL) return -1;
      return a.localeCompare(b);
    })
    .map(([name, items]) => ({
      name,
      events: [...items].sort((a, b) => {
        const byKind = kindRank(a.kind) - kindRank(b.kind);
        if (byKind !== 0) return byKind;
        return a.title.localeCompare(b.title);
      }),
    }));
}
