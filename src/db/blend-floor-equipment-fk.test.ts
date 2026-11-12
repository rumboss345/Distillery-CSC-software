import { describe, expect, it } from 'vitest';
import { blendFloorEquipmentFk } from './queries';

describe('blendFloorEquipmentFk', () => {
  it('maps zero and negative ids to null', () => {
    expect(blendFloorEquipmentFk(0)).toBeNull();
    expect(blendFloorEquipmentFk(-1)).toBeNull();
    expect(blendFloorEquipmentFk(null)).toBeNull();
    expect(blendFloorEquipmentFk(undefined)).toBeNull();
  });

  it('keeps valid equipment ids', () => {
    expect(blendFloorEquipmentFk(42)).toBe(42);
  });
});
