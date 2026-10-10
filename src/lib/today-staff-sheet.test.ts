import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from './calendar-events';
import { groupEventsByStaff, UNASSIGNED_STAFF_LABEL } from './today-staff-sheet';

function event(partial: Pick<CalendarEvent, 'id' | 'title' | 'kind'> & { assignee?: string }): CalendarEvent {
  return {
    startDate: '2026-10-10',
    allDay: true,
    status: 'planned',
    statusCategory: 'planned',
    ...partial,
  };
}

describe('groupEventsByStaff', () => {
  it('groups one day by who is doing the work and leaves unassigned last', () => {
    const groups = groupEventsByStaff([
      event({ id: '1', assignee: 'Sam', title: 'D-2', kind: 'distillation' }),
      event({ id: '2', assignee: 'Alex', title: 'Wash B', kind: 'wash' }),
      event({ id: '3', assignee: '  ', title: 'Bottles', kind: 'bottling' }),
      event({ id: '4', assignee: 'Alex', title: 'Ferment A', kind: 'fermentation' }),
      event({ id: '5', title: 'Blend', kind: 'blend' }),
    ]);

    expect(groups.map((group) => group.name)).toEqual(['Alex', 'Sam', UNASSIGNED_STAFF_LABEL]);
    expect(groups[0].events.map((item) => item.title)).toEqual(['Wash B', 'Ferment A']);
    expect(groups[2].events.map((item) => item.kind)).toEqual(['bottling', 'blend']);
  });

  it('returns no groups when the day is empty', () => {
    expect(groupEventsByStaff([])).toEqual([]);
  });
});