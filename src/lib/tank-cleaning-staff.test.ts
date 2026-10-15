import { describe, expect, it } from 'vitest';
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

  it('keeps a tank that still needs cleaning on the sheet through today', () => {
    const logs = [
      row({ id: 1, eventType: 'needs_cleaning', createdAt: '2026-10-14T08:00:00' }),
    ];

    expect(tankCleaningStaffEvents(logs, '2026-10-14', today)).toMatchObject([
      { title: 'Latina 500L', status: 'cleaning', detail: 'Collection Vessels · Needs cleaning', assignee: undefined },
    ]);
    expect(tankCleaningStaffEvents(logs, today, today)).toHaveLength(1);
    expect(tankCleaningStaffEvents(logs, '2026-10-16', today)).toEqual([]);
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

    const flagged = tankCleaningStaffEvents(logs, '2026-10-14', today);
    expect(flagged.map((event) => event.status)).toEqual(['cleaning']);

    const cleaned = tankCleaningStaffEvents(logs, '2026-10-15', today);
    expect(cleaned).toMatchObject([
      { status: 'complete', assignee: 'Sam', detail: 'Collection Vessels · Cleaned' },
    ]);
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
    const events = tankCleaningStaffEvents(logs, '2026-10-15', today);
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe('complete');
  });

  it('includes every tank type and skips stills and fermenters', () => {
    const logs: TankCleaningLogRow[] = [
      row({ id: 1, equipmentId: 1, equipmentName: 'Wash tank', equipmentType: 'mash_tun', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 2, equipmentId: 2, equipmentName: 'Heads tank', equipmentType: 'holding_tank', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 3, equipmentId: 3, equipmentName: 'Stillage Storage tank', equipmentType: 'stillage_tank', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 4, equipmentId: 4, equipmentName: 'Vendome', equipmentType: 'pot_still', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
      row({ id: 5, equipmentId: 5, equipmentName: 'Fermentation 1', equipmentType: 'fermenter', eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
    ];
    expect(tankCleaningStaffEvents(logs, today, today).map((event) => event.title)).toEqual([
      'Heads tank',
      'Stillage Storage tank',
      'Wash tank',
    ]);
  });

  it('puts unassigned tank cleaning after named staff on the sheet', () => {
    const events = tankCleaningStaffEvents([
      row({ id: 1, eventType: 'needs_cleaning', createdAt: '2026-10-15T08:00:00' }),
    ], today, today);
    expect(groupEventsByStaff(events).map((group) => group.name)).toEqual([UNASSIGNED_STAFF_LABEL]);
    expect(events[0]?.kind).toBe('cleaning');
  });
});
