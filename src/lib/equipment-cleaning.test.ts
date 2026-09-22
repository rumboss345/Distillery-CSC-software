import { describe, expect, it } from 'vitest';
import { equipmentNeedsCleaning } from './equipment-cleaning';
import { equipmentUnavailableForProduction } from './equipment-maintenance';
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
  cleaned_at: null,
  cleaned_by_user_id: null,
  cleaned_by_user_name: null,
  created_at: '',
  ...overrides,
});

describe('equipment cleaning', () => {
  it('flags cleaning status as needs cleaning', () => {
    expect(equipmentNeedsCleaning(base({ status: 'cleaning' }))).toBe(true);
    expect(equipmentNeedsCleaning(base({ status: 'empty' }))).toBe(false);
  });

  it('blocks production use when cleaning is required', () => {
    expect(equipmentUnavailableForProduction(base({ status: 'cleaning' }))).toBe(true);
    expect(equipmentUnavailableForProduction(base({ status: 'empty' }))).toBe(false);
  });
});
