import { describe, expect, it } from 'vitest';
import { isEquipmentContextMenuPointer } from './process-equipment-gesture';

describe('isEquipmentContextMenuPointer', () => {
  it('treats a right-click and a Mac ctrl-click as the context menu', () => {
    expect(isEquipmentContextMenuPointer(2, false)).toBe(true);
    expect(isEquipmentContextMenuPointer(0, true)).toBe(true);
  });

  it('does not treat a normal click or drag as a right-click', () => {
    expect(isEquipmentContextMenuPointer(0, false)).toBe(false);
    expect(isEquipmentContextMenuPointer(1, false)).toBe(false);
  });
});
