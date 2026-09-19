import { describe, expect, it } from 'vitest';
import {
  equipmentBlocksProduction,
  equipmentHasMaintenanceTag,
  equipmentShowsRepairNoteIndicator,
  groupEquipmentByCategory,
} from './equipment-maintenance';
import type { FloorEquipment } from '../types';

const base = (overrides: Partial<FloorEquipment>): FloorEquipment => ({
  id: 1,
  floor_plan_id: 1,
  name: 'Test',
  equipment_type: 'fermenter',
  pos_x_ft: 0,
  pos_y_ft: 0,
  process_pos_x: null,
  process_pos_y: null,
  width_ft: 10,
  depth_ft: 10,
  capacity_gal: 100,
  status: 'empty',
  linked_mash_batch_id: null,
  notes: '',
  maintenance_status: null,
  maintenance_notes: '',
  created_at: '',
  ...overrides,
});

describe('equipment maintenance', () => {
  it('blocks broken and under maintenance only', () => {
    expect(equipmentBlocksProduction(base({ maintenance_status: null }))).toBe(false);
    expect(equipmentBlocksProduction(base({ maintenance_status: 'repair_note' }))).toBe(false);
    expect(equipmentBlocksProduction(base({ maintenance_status: 'broken' }))).toBe(true);
    expect(equipmentBlocksProduction(base({ maintenance_status: 'maintenance' }))).toBe(true);
  });

  it('flags maintenance tags and repair note indicator', () => {
    expect(equipmentHasMaintenanceTag(base({ maintenance_status: null }))).toBe(false);
    expect(equipmentHasMaintenanceTag(base({ maintenance_status: 'broken' }))).toBe(true);
    expect(equipmentShowsRepairNoteIndicator(base({ maintenance_status: 'repair_note' }))).toBe(true);
    expect(equipmentShowsRepairNoteIndicator(base({ maintenance_status: 'broken' }))).toBe(false);
  });

  it('groups by equipment type in catalog order', () => {
    const groups = groupEquipmentByCategory([
      base({ id: 2, name: 'B Tank', equipment_type: 'holding_tank' }),
      base({ id: 1, name: 'A Fermenter', equipment_type: 'fermenter' }),
    ]);
    expect(groups.map((g) => g.type)).toEqual(['fermenter', 'holding_tank']);
    expect(groups[0].items[0].name).toBe('A Fermenter');
  });
});
