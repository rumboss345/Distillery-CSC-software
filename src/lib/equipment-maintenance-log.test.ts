import { describe, expect, it } from 'vitest';
import {
  describeEquipmentMaintenanceLogEntry,
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
