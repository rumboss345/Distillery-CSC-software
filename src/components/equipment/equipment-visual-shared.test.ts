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
    icon: '',
    maintenance_status: null,
    maintenance_notes: '',
    cleaned_at: null,
    cleaned_by_user_id: null,
    cleaned_by_user_name: null,
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

  it('shows wash volume while a wash tank is washing', () => {
    const visual = buildEquipmentVisualData(
      fermenterView({
        name: 'Wash tank',
        equipment_type: 'mash_tun',
        capacity_gal: 600,
        active_volume_gal: 468,
        active_mash_status: 'mashing',
        active_batch_number: 'W-2026-002',
      }),
    );
    expect(visual.isWashing).toBe(true);
    expect(visual.currentVolumeGal).toBe(468);
    expect(visual.fillPercent).toBeCloseTo((468 / 600) * 100);
    expect(visual.liquidName).toBe('Wash W-2026-002');
  });

  it('keeps wash volume on the process view when the volume report is 0', () => {
    const visual = buildEquipmentVisualData(
      fermenterView({
        name: 'Wash tank',
        equipment_type: 'mash_tun',
        capacity_gal: 600,
        active_volume_gal: 500,
        active_mash_status: 'mashing',
        active_batch_number: 'W-2026-003',
      }),
      {
        id: 1,
        name: 'Wash tank',
        equipment_type: 'mash_tun',
        status: 'in_use',
        capacity_gal: 600,
        volume_gal: 0,
        abv: null,
        detail: '',
      },
    );
    expect(visual.isWashing).toBe(true);
    expect(visual.currentVolumeGal).toBe(500);
    expect(visual.fillPercent).toBeCloseTo((500 / 600) * 100);
    expect(visual.liquidName).toBe('Wash W-2026-003');
  });

  it('shows wash volume while washing even if the tank is marked for cleaning', () => {
    const visual = buildEquipmentVisualData(
      fermenterView({
        name: 'Wash tank',
        equipment_type: 'mash_tun',
        status: 'cleaning',
        capacity_gal: 2000,
        active_volume_gal: 500,
        active_mash_status: 'mashing',
        active_batch_number: 'W-2026-004',
      }),
    );
    expect(visual.isWashing).toBe(true);
    expect(visual.currentVolumeGal).toBe(500);
    expect(visual.fillPercent).toBeCloseTo((500 / 2000) * 100);
  });

  it('shows 0 gallons while a tank is being cleaned', () => {
    const visual = buildEquipmentVisualData(
      fermenterView({
        name: 'Holding tank',
        equipment_type: 'holding_tank',
        status: 'cleaning',
        capacity_gal: 600,
        active_volume_gal: 400,
        active_batch_number: undefined,
        active_mash_status: undefined,
      }),
    );
    expect(visual.currentVolumeGal).toBe(0);
    expect(visual.fillPercent).toBe(0);
    expect(visual.status).toBe('warning');
  });

  it('uses a saved icon and otherwise matches the equipment type', () => {
    expect(buildEquipmentVisualData(fermenterView()).icon).toBe('fermenter');
    expect(buildEquipmentVisualData(fermenterView({ icon: 'pump' })).icon).toBe('pump');
    expect(buildEquipmentVisualData(fermenterView({ equipment_type: 'holding_tank', icon: 'jug' })).icon).toBe('jug');
    expect(buildEquipmentVisualData(fermenterView({ equipment_type: 'Gin basket', icon: 'pot_still' })).icon).toBe('pot_still');
    expect(buildEquipmentVisualData(fermenterView({ equipment_type: 'other', icon: 'bottling_line' })).icon).toBe('bottling_line');
  });
});
