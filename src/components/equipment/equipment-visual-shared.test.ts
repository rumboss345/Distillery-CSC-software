import { describe, expect, it } from 'vitest';
import { buildEquipmentVisualData } from './equipment-visual-shared';
import type { EquipmentVolumeReport, FloorEquipmentView } from '../../types';

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

  it('shows the ledger product on a holding tank', () => {
    const report: EquipmentVolumeReport = {
      id: 1,
      name: 'Storage tank of tails runs',
      equipment_type: 'holding_tank',
      status: 'in_use',
      capacity_gal: 500,
      volume_gal: 120,
      abv: 70,
      detail: '1 distillation run · 1 cut',
    };
    const visual = buildEquipmentVisualData(
      fermenterView({
        equipment_type: 'holding_tank',
        name: 'Storage tank of tails runs',
        active_batch_number: undefined,
        notes: 'do not use notes',
      }),
      report,
      undefined,
      'Hearts from D-2025-001 (low wine run)',
    );
    expect(visual.liquidName).toBe('Hearts from D-2025-001 (low wine run)');
  });

  it('does not invent a product for an empty tank', () => {
    const visual = buildEquipmentVisualData(
      fermenterView({
        equipment_type: 'holding_tank',
        name: 'Storage tank of tails runs',
        active_batch_number: undefined,
        active_volume_gal: 0,
        status: 'empty',
        notes: 'Hearts',
      }),
      undefined,
      undefined,
      null,
    );
    expect(visual.liquidName).toBeUndefined();
    expect(visual.currentVolumeGal).toBe(0);
  });

  it('uses a saved icon and otherwise matches the equipment type', () => {
    expect(buildEquipmentVisualData(fermenterView()).icon).toBe('fermenter');
    expect(buildEquipmentVisualData(fermenterView({ icon: 'pump' })).icon).toBe('pump');
    expect(buildEquipmentVisualData(fermenterView({ equipment_type: 'holding_tank', icon: 'jug' })).icon).toBe('jug');
    expect(buildEquipmentVisualData(fermenterView({ equipment_type: 'Gin basket', icon: 'pot_still' })).icon).toBe('pot_still');
  });
});
