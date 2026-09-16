import { describe, expect, it } from 'vitest';
import { barrelsForBlendRow, hasDuplicateBarrelSelections } from './barrel-blending';
import type { Barrel } from '../types';

const barrel = (id: number): Barrel => ({
  id,
  barrel_number: `B-${id}`,
  wood_type: 'Oak',
  capacity_gal: 53,
  fill_date: '2026-01-01',
  spirit_type: 'Rum',
  source_run_id: null,
  source_holding_tank_equipment_id: null,
  initial_abv: 60,
  current_volume_gal: 50,
  warehouse_location: '',
  status: 'aging',
  notes: '',
  created_at: '2026-01-01',
});

describe('barrelsForBlendRow', () => {
  const inventory = [barrel(1), barrel(2), barrel(3)];

  it('hides barrels selected on other rows', () => {
    const options = barrelsForBlendRow(inventory, [1, null, 2], 1);
    expect(options.map((b) => b.id)).toEqual([3]);
  });

  it('keeps the current row barrel in the list when another row uses a different barrel', () => {
    const options = barrelsForBlendRow(inventory, [1, 2, null], 1);
    expect(options.map((b) => b.id)).toEqual([2, 3]);
  });
});

describe('hasDuplicateBarrelSelections', () => {
  it('detects duplicate barrel ids', () => {
    expect(hasDuplicateBarrelSelections([1, 2, 1])).toBe(true);
    expect(hasDuplicateBarrelSelections([1, 2, null])).toBe(false);
  });
});
