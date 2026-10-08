import { describe, expect, it } from 'vitest';
import { equipmentIconShowsVolume, resolveEquipmentIcon } from './equipment';

describe('equipment icons', () => {
  it('keeps a chosen picture, otherwise uses the equipment type', () => {
    expect(resolveEquipmentIcon('', 'holding_tank')).toBe('holding_tank');
    expect(resolveEquipmentIcon('jug', 'holding_tank')).toBe('jug');
    expect(resolveEquipmentIcon('hose', 'holding_tank')).toBe('hose');
    expect(resolveEquipmentIcon('', 'Gin basket')).toBe('other');
    expect(resolveEquipmentIcon('pot_still', 'Gin basket')).toBe('pot_still');
  });

  it('shows a fill level for tanks, fermenters, wash tanks, and stills', () => {
    expect(equipmentIconShowsVolume('holding_tank')).toBe(true);
    expect(equipmentIconShowsVolume('jug')).toBe(true);
    expect(equipmentIconShowsVolume('stillage_tank')).toBe(true);
    expect(equipmentIconShowsVolume('collection_vessel')).toBe(true);
    expect(equipmentIconShowsVolume('fermenter')).toBe(true);
    expect(equipmentIconShowsVolume('mash_tun')).toBe(true);
    expect(equipmentIconShowsVolume('pot_still')).toBe(true);
    expect(equipmentIconShowsVolume('column_still')).toBe(true);
    expect(equipmentIconShowsVolume('pump')).toBe(false);
    expect(equipmentIconShowsVolume('hose')).toBe(false);
    expect(equipmentIconShowsVolume('boiler')).toBe(false);
  });
});
