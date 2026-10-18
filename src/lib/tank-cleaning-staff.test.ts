import { describe, expect, it } from 'vitest';
import { calendarProgress } from './calendar-events';
import { groupEventsByStaff, UNASSIGNED_STAFF_LABEL } from './today-staff-sheet';
import {
  tankCleaningStaffEvents,
  type TankCleaningLogRow,
} from './tank-cleaning-staff';

function row(partial: Partial<TankCleaningLogRow> & Pick<TankCleaningLogRow, 'id' | 'eventType' | 'createdAt'>): TankCleaningLogRow {
  return {
    equipmentId: 18,
    equipmentName: 'Latina 500L',
    equipmentType: 'collection_vessel',
    recordedBy: '',
    status: 'cleaning',
    ...partial,
  };
}

describe('tankCleaningStaffEvents', () => {
  const today = '2026-10-15';

  it('keeps a dirty tank upcoming every day until it is cleaned', () => {
    const logs = [
      row({ id: 1, eventType: 'needs_cleaning', createdAt: '2026-10-14T08:00:00' }),
    ];

    expect(tankCleaningStaffEvents(logs, '2026-10-14')).toMatchObject([
      { title: 'Latina 500L', status: 'upcoming', statusCategory: 'planned', detail: 'Collection Vessels · Needs cleaning', assignee: undefined },
    ]);
    expect(tankCleaningStaffEvents(logs, today)).toHaveLength(1);
    expect(tankCleaningStaffEvents(logs, '2026-10-16')).toMatchObject([
      { status: 'upcoming', statusCategory: 'planned', continuesUntilCleaned: true },
    ]);
    expect(tankCleaningStaffEvents(logs, '2026-10-13')).toEqual([]);
  });

  it('stays upcoming when a clean was logged but the tank is still dirty', () => {
    const logs = [
      row({ id: 1, eventType: 'needs_cleaning', createdAt: '2026-10-14T08:00:00', status: 'cleaning' }),
      row({
        id: 2,
        eventType: 'marked_cleaned',
        createdAt: '2026-10-15T09:30:00',
        recordedBy: 'Sam',
        status: 'cleaning',
      }),
    ];

    expect(tankCleaningStaffEvents(logs, '2026-10-15')).toMatchObject([
      { status: 'upcoming', statusCategory: 'planned', assignee: undefined, detail: 'Collection Vessels · Needs cleaning' },
    ]);
  });

  it('lists a cleaned tank for the person who cleaned it, on that day', () => {
    const logs = [
      row({ id: 1, eventType: 'needs_cleaning', createdAt: '2026-10-14T08:00:00', status: 'empty' }),
      row({
        id: 2,
        eventType: 'marked_cleaned',
        createdAt: '2026-10-15T09:30:00',
        recordedBy: 'Sam',
        status: 'empty',
      }),
    ];

    const flagged = tankCleaningStaffEvents(logs, '2026-10-14');
    expect(flagged.map((event) => event.status)).toEqual(['upcoming']);

    const cleaned = tankCleaningStaffEvents(logs, '2026-10-15');
    expect(cleaned).toMatchObject([
      { status: 'done', assignee: 'Sam', detail: 'Collection Vessels · Cleaned' },
    ]);
    expect(tankCleaningStaffEvents(logs, '2026-10-16')).toEqual([]);
    expect(calendarProgress(cleaned[0]!.statusCategory)).toBe('done');
    expect(groupEventsByStaff(cleaned).map((group) => group.name)).toEqual(['Sam']);
  });

  it('shows only the completed cleaning when the tank is cleaned the same day', () => {
    const logs = [
      row({ id: 1, eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00', status: 'empty' }),
      row({
        id: 2,
        eventType: 'marked_cleaned',
        createdAt: '2026-10-15T11:00:00',
        recordedBy: 'Alex',
        status: 'empty',
      }),
    ];
    const events = tankCleaningStaffEvents(logs, '2026-10-15');
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe('done');
    expect(calendarProgress(events[0]!.statusCategory)).toBe('done');
  });

  it('keeps dirty equipment on Upcoming and never treats cleaning as in progress', () => {
    const dirty = tankCleaningStaffEvents([
      row({ id: 1, eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00', status: 'cleaning' }),
    ], today);
    expect(dirty[0]?.status).toBe('upcoming');
    expect(calendarProgress(dirty[0]!.statusCategory)).toBe('upcoming');
  });

  it('includes tanks, fermenters, and stills that need cleaning', () => {
    const logs: TankCleaningLogRow[] = [
      row({ id: 1, equipmentId: 1, equipmentName: 'Wash tank', equipmentType: 'mash_tun', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 2, equipmentId: 2, equipmentName: 'Heads tank', equipmentType: 'holding_tank', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 3, equipmentId: 3, equipmentName: 'Stillage Storage tank', equipmentType: 'stillage_tank', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 4, equipmentId: 4, equipmentName: 'Vendome', equipmentType: 'pot_still', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 5, equipmentId: 5, equipmentName: 'Fermentation 1', equipmentType: 'fermenter', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 6, equipmentId: 6, equipmentName: 'Carl column still', equipmentType: 'column_still', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 7, equipmentId: 7, equipmentName: 'Pump', equipmentType: 'pump', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
    ];
    const events = tankCleaningStaffEvents(logs, today);
    expect(events.map((event) => event.title)).toEqual([
      'Carl column still',
      'Fermentation 1',
      'Heads tank',
      'Stillage Storage tank',
      'Vendome',
      'Wash tank',
    ]);
    expect(events.find((event) => event.title === 'Fermentation 1')).toMatchObject({
      status: 'upcoming',
      detail: 'Fermenter · Needs cleaning',
    });
    expect(events.find((event) => event.title === 'Vendome')).toMatchObject({
      status: 'upcoming',
      detail: 'Pot Still · Needs cleaning',
    });
    expect(events.find((event) => event.title === 'Carl column still')).toMatchObject({
      detail: 'Column Still · Needs cleaning',
    });
  });

  it('puts unassigned tank cleaning after named staff on the sheet', () => {
    const events = tankCleaningStaffEvents([
      row({ id: 1, eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
    ], today);
    expect(groupEventsByStaff(events).map((group) => group.name)).toEqual([UNASSIGNED_STAFF_LABEL]);
    expect(events[0]?.kind).toBe('cleaning');
  });
});
