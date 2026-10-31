import { describe, expect, it } from 'vitest';
import { applyEquipmentIconPick, equipmentIconShowsVolume, resolveEquipmentIcon } from './equipment';

describe('equipment icons', () => {
  it('keeps a chosen picture, otherwise uses the equipment type', () => {
    expect(resolveEquipmentIcon('', 'holding_tank')).toBe('holding_tank');
    expect(resolveEquipmentIcon('jug', 'holding_tank')).toBe('jug');
    expect(resolveEquipmentIcon('hose', 'holding_tank')).toBe('hose');
    expect(resolveEquipmentIcon('', 'Gin basket')).toBe('other');
    expect(resolveEquipmentIcon('pot_still', 'Gin basket')).toBe('pot_still');
    expect(resolveEquipmentIcon('bottling_line', 'other')).toBe('bottling_line');
    expect(resolveEquipmentIcon('labeler', 'holding_tank')).toBe('labeler');
  });

  it('lets the picture differ from the equipment type', () => {
    const form = applyEquipmentIconPick({
      name: 'F1',
      equipment_type: 'fermenter',
      icon: 'fermenter',
    }, 'pot_still');
    expect(form.equipment_type).toBe('fermenter');
    expect(form.icon).toBe('pot_still');
    expect(applyEquipmentIconPick(form, 'jug')).toEqual({
      name: 'F1',
      equipment_type: 'fermenter',
      icon: 'jug',
    });
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
    expect(equipmentIconShowsVolume('bottling_line')).toBe(false);
    expect(equipmentIconShowsVolume('labeler')).toBe(false);
    expect(equipmentIconShowsVolume('gin_basket')).toBe(false);
    expect(equipmentIconShowsVolume('barrel_rack')).toBe(false);
    expect(equipmentIconShowsVolume('filter')).toBe(false);
    expect(equipmentIconShowsVolume('heat_exchanger')).toBe(false);
    expect(equipmentIconShowsVolume('mixer')).toBe(false);
    expect(equipmentIconShowsVolume('scale')).toBe(false);
  });
});
