import { describe, expect, it } from 'vitest';
import {
  UNASSIGNED_WAREHOUSE_LOCATION,
  groupBarrelsByLocation,
  normalizeWarehouseLocationName,
  warehouseLocationNameError,
} from './warehouse-locations';

describe('warehouse locations', () => {
  it('trims a location name and rejects a blank one', () => {
    expect(normalizeWarehouseLocationName('  Rickhouse   B  ')).toBe('Rickhouse B');
    expect(warehouseLocationNameError('   ')).toMatch(/location name/);
    expect(warehouseLocationNameError('Rickhouse B')).toBeNull();
  });

  it('keeps empty locations and groups barrels into them', () => {
    const groups = groupBarrelsByLocation(
      [
        { warehouse_location: 'warehouse a - row 1', barrel_number: 'B-001', fill_date: '2025-06-11' },
        { warehouse_location: '', barrel_number: 'B-002', fill_date: '2025-01-01' },
        { warehouse_location: 'Rickhouse B', barrel_number: 'B-003', fill_date: '2024-04-01' },
      ],
      [
        { id: 1, name: 'Warehouse A - Row 1' },
        { id: 2, name: 'Rickhouse B' },
      ],
    );
    expect(groups.map((group) => group.name)).toEqual([
      'Rickhouse B',
      'Warehouse A - Row 1',
      UNASSIGNED_WAREHOUSE_LOCATION,
    ]);
    expect(groups[0].barrels.map((barrel) => barrel.barrel_number)).toEqual(['B-003']);
    expect(groups[1].locationId).toBe(1);
    expect(groups[1].barrels).toHaveLength(1);
    expect(groups[2].barrels.map((barrel) => barrel.barrel_number)).toEqual(['B-002']);
  });

  it('puts the oldest barrels first within a location', () => {
    const groups = groupBarrelsByLocation(
      [
        { warehouse_location: 'Rickhouse B', barrel_number: 'B-011', fill_date: '2025-12-01' },
        { warehouse_location: 'Rickhouse B', barrel_number: 'B-012', fill_date: '2023-09-01' },
        { warehouse_location: 'Rickhouse B', barrel_number: 'B-010', fill_date: '2023-09-01' },
      ],
      [{ id: 2, name: 'Rickhouse B' }],
    );
    expect(groups[0].barrels.map((barrel) => barrel.barrel_number)).toEqual(['B-010', 'B-012', 'B-011']);
  });

  it('shows a new location before any barrel is placed there', () => {
    const groups = groupBarrelsByLocation(
      [],
      [{ id: 4, name: 'Rickhouse C' }],
    );
    expect(groups).toEqual([{ name: 'Rickhouse C', locationId: 4, barrels: [] }]);
  });
});
