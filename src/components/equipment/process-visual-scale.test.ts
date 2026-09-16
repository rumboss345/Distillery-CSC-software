import { describe, expect, it } from 'vitest';
import { processEquipmentVisualScale } from './process-visual-scale';

describe('processEquipmentVisualScale', () => {
  it('scales holding tanks down and fermenters/stills up', () => {
    expect(processEquipmentVisualScale('holding_tank')).toBe(0.5);
    expect(processEquipmentVisualScale('fermenter')).toBe(2);
    expect(processEquipmentVisualScale('pot_still')).toBe(2);
    expect(processEquipmentVisualScale('column_still')).toBe(2);
    expect(processEquipmentVisualScale('mash_tun')).toBe(1);
  });
});
