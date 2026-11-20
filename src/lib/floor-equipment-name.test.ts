import { describe, expect, it } from 'vitest';
import { floorEquipmentNameConflictMessage, normalizeFloorEquipmentName } from './floor-equipment-name';

describe('floor equipment names', () => {
  it('trims names before compare', () => {
    expect(normalizeFloorEquipmentName('  Tank 1  ')).toBe('Tank 1');
  });

  it('describes a name conflict', () => {
    expect(floorEquipmentNameConflictMessage('HEARTS')).toContain('already exists');
  });
});