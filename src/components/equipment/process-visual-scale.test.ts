import { describe, expect, it } from 'vitest';
import { processEquipmentVisualScale } from './process-visual-scale';

describe('processEquipmentVisualScale', () => {
  it('applies process canvas scale per equipment type', () => {
    expect(processEquipmentVisualScale('holding_tank')).toBe(0.5);
    expect(processEquipmentVisualScale('collection_vessel')).toBe(0.5);
    expect(processEquipmentVisualScale('fermenter')).toBe(1.1);
    expect(processEquipmentVisualScale('pot_still')).toBe(1);
    expect(processEquipmentVisualScale('column_still')).toBe(1);
    expect(processEquipmentVisualScale('mash_tun')).toBe(1);
  });
});
