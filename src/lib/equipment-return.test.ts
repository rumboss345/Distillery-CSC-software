import { describe, expect, it } from 'vitest';
import { equipmentReturnPath, equipmentReturnState, readEquipmentReturn } from './equipment-return';

describe('equipment return', () => {
  it('returns to the Equipment page with the vessel selected', () => {
    expect(equipmentReturnPath(12)).toBe('/floor-plan?equipment=12');
    expect(equipmentReturnPath(null)).toBe('/floor-plan');
    expect(equipmentReturnState(4)).toEqual({ returnTo: '/floor-plan?equipment=4' });
  });

  it('only reads an Equipment page return from router state', () => {
    expect(readEquipmentReturn({ returnTo: '/floor-plan?equipment=4' })).toBe('/floor-plan?equipment=4');
    expect(readEquipmentReturn({ returnTo: '/reports' })).toBeNull();
    expect(readEquipmentReturn({ returnTo: 7 })).toBeNull();
    expect(readEquipmentReturn(null)).toBeNull();
    expect(readEquipmentReturn('x')).toBeNull();
  });
});
