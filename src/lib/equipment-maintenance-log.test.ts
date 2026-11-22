import { describe, expect, it } from 'vitest';
import {
  describeEquipmentMaintenanceLogEntry,
  filterMaintenanceLogEntries,
  groupMaintenanceReportRows,
} from './equipment-maintenance-log';

const row = (
  event_type: 'needs_cleaning' | 'marked_cleaned' | 'maintenance_set' | 'returned_to_service',
  maintenance_status: 'broken' | 'maintenance' | 'repair_note' | null,
  id: string,
) => ({ event_type, maintenance_status, id });

describe('groupMaintenanceReportRows', () => {
  it('keeps each status in its own group', () => {
    const groups = groupMaintenanceReportRows([
      row('returned_to_service', null, 'back'),
      row('maintenance_set', 'repair_note', 'note'),
      row('needs_cleaning', null, 'dirty'),
      row('maintenance_set', 'broken', 'broke'),
      row('marked_cleaned', null, 'clean'),
      row('maintenance_set', 'maintenance', 'down'),
      row('needs_cleaning', null, 'dirty-2'),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      'Needs cleaning',
      'Marked cleaned',
      'Broken',
      'Under maintenance',
      'Repair note',
      'Returned to service',
    ]);
    expect(groups.map((group) => group.rows.map((item) => item.id))).toEqual([
      ['dirty', 'dirty-2'],
      ['clean'],
      ['broke'],
      ['down'],
      ['note'],
      ['back'],
    ]);
  });

  it('puts an unrecognized status after the known groups', () => {
    const groups = groupMaintenanceReportRows([
      row('maintenance_set', null, 'plain'),
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      'Needs cleaning',
      'Marked cleaned',
      'Broken',
      'Under maintenance',
      'Repair note',
      'Returned to service',
      'Other',
    ]);
    expect(groups[6].rows.map((item) => item.id)).toEqual(['plain']);
  });
});

describe('filterMaintenanceLogEntries', () => {
  const entries = [
  {
    id: 1,
    created_at: '2026-11-15 10:00:00',
    event_type: 'marked_cleaned' as const,
    maintenance_status: null,
  },
  {
    id: 2,
    created_at: '2026-11-20 10:00:00',
    event_type: 'maintenance_set' as const,
    maintenance_status: 'broken' as const,
  },
  {
    id: 3,
    created_at: '2026-10-01 10:00:00',
    event_type: 'needs_cleaning' as const,
    maintenance_status: null,
  },
  ];

  it('filters by inclusive date range', () => {
    const filtered = filterMaintenanceLogEntries(entries, {
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(filtered.map((row) => row.id)).toEqual([1, 2]);
  });

  it('filters by event status key', () => {
    const filtered = filterMaintenanceLogEntries(entries, { eventKey: 'broken' });
    expect(filtered.map((row) => row.id)).toEqual([2]);
  });
});

describe('describeEquipmentMaintenanceLogEntry', () => {
  it('includes maintenance status for issue records', () => {
    const text = describeEquipmentMaintenanceLogEntry({
      event_type: 'maintenance_set',
      maintenance_status: 'broken',
      notes: 'Seal leak',
    });
    expect(text).toContain('Broken');
  });

  it('labels cleaning events', () => {
    expect(describeEquipmentMaintenanceLogEntry({
      event_type: 'marked_cleaned',
      maintenance_status: null,
      notes: '',
    })).toContain('Marked cleaned');
  });
});
