import { describe, expect, it } from 'vitest';
import {
  distillationSourceTypeChoices,
  tanksOfEquipmentType,
} from './distillation-source-tanks';

describe('distillation source tanks', () => {
  it('lists holding tanks, stillage tanks, and collection vessels in that order', () => {
    expect(distillationSourceTypeChoices([
      'collection_vessel',
      'fermenter',
      'holding_tank',
      'pot_still',
      'stillage_tank',
    ])).toEqual(['holding_tank', 'stillage_tank', 'collection_vessel']);
  });

  it('omits types that are not on the spirit ledger', () => {
    expect(distillationSourceTypeChoices(['fermenter', 'mash_tun', 'pot_still'])).toEqual([]);
  });

  it('shows only tanks of the selected equipment type', () => {
    const tanks = [
      { id: 1, equipment_type: 'holding_tank', name: 'Low Wines' },
      { id: 2, equipment_type: 'collection_vessel', name: 'Hearts jug' },
      { id: 3, equipment_type: 'holding_tank', name: 'High proof' },
    ];
    expect(tanksOfEquipmentType(tanks, '').map((tank) => tank.id)).toEqual([]);
    expect(tanksOfEquipmentType(tanks, 'holding_tank').map((tank) => tank.name)).toEqual([
      'Low Wines',
      'High proof',
    ]);
    expect(tanksOfEquipmentType(tanks, 'collection_vessel').map((tank) => tank.id)).toEqual([2]);
  });
});
