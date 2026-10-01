import { describe, expect, it } from 'vitest';
import { groupEquipmentByStage } from './process-stages';
import type { FloorEquipmentView } from '../../types';

function item(id: number, equipment_type: string, name = `Item ${id}`): FloorEquipmentView {
  return {
    id,
    floor_plan_id: 1,
    name,
    equipment_type,
    pos_x_ft: 0,
    pos_y_ft: 0,
    process_pos_x: null,
    process_pos_y: null,
    width_ft: 8,
    depth_ft: 8,
    capacity_gal: 0,
    status: 'empty',
    linked_mash_batch_id: null,
    notes: '',
    icon: '',
    maintenance_status: null,
    maintenance_notes: '',
    cleaned_at: null,
    cleaned_by_user_id: null,
    cleaned_by_user_name: null,
    created_at: '',
  };
}

describe('groupEquipmentByStage', () => {
  it('gives each added equipment type its own section', () => {
    const groups = groupEquipmentByStage([
      item(1, 'fermenter', 'Fermentation 1'),
      item(2, 'Gin basket', 'Basket 1'),
      item(3, 'Thumper', 'Thumper 1'),
    ]);
    expect(groups.map((group) => group.stage.label)).toEqual([
      'Fermenter',
      'Gin basket',
      'Thumper',
    ]);
  });

  it('groups pumps and hoses together', () => {
    const groups = groupEquipmentByStage([
      item(1, 'pump', 'Transfer pump'),
      item(2, 'hose', 'Charge hose'),
      item(3, 'holding_tank', 'Hearts tank'),
    ]);
    expect(groups.map((group) => group.stage.label)).toEqual([
      'Holding Tanks',
      'Pumps & Hoses',
    ]);
    expect(groups[1].items.map((entry) => entry.name)).toEqual(['Transfer pump', 'Charge hose']);
  });
});
