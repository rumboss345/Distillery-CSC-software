import { describe, expect, it } from 'vitest';
import { describeEquipmentMaintenanceLogEntry } from './equipment-maintenance-log';

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
