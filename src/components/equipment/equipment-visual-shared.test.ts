import { describe, expect, it } from 'vitest';
import { buildEquipmentVisualData } from './equipment-visual-shared';
import type { FloorEquipmentView } from '../../types';

function fermenterView(overrides: Partial<FloorEquipmentView> = {}): FloorEquipmentView {
  return {
    id: 1,
    floor_plan_id: 1,
    name: 'Fermenter 1',
    equipment_type: 'fermenter',
    pos_x_ft: 0,
    pos_y_ft: 0,
    process_pos_x: null,
    process_pos_y: null,
    width_ft: 10,
    depth_ft: 10,
    capacity_gal: 500,
    status: 'in_use',
    linked_mash_batch_id: null,
    notes: '',
    created_at: '',
    active_batch_number: 'W-2026-001',
    active_volume_gal: 400,
    active_mash_status: 'fermenting',
    active_start_brix: 18,
    active_latest_brix: 8,
    ...overrides,
  };
}

describe('buildEquipmentVisualData fermenter est. ABV', () => {
  it('computes estimated ABV from start and latest Brix', () => {
    const visual = buildEquipmentVisualData(fermenterView());
    expect(visual.estimatedAbv).not.toBeNull();
    expect(visual.estimatedAbv).toBeGreaterThan(0);
  });

  it('omits estimated ABV for non-fermenters', () => {
    const visual = buildEquipmentVisualData(
      fermenterView({ equipment_type: 'holding_tank', active_batch_number: undefined }),
    );
    expect(visual.estimatedAbv).toBeUndefined();
  });
});
