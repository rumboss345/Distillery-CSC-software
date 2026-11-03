import { describe, expect, it } from 'vitest';
import {
  bottlingEquipmentOptions,
  bottlingEquipmentToMarkDirty,
  bottlingEquipmentToRelease,
  isBottlingEquipmentType,
  mergeBottlingRunEquipmentIds,
  splitBottlingRunEquipmentIds,
  uniqueEquipmentIds,
} from './bottling-equipment';

const item = (
  id: number,
  name: string,
  equipment_type: string,
  icon = '',
) => ({ id, name, equipment_type, icon });

describe('bottling equipment', () => {
  it('offers bottling lines, pumps, hoses, and other gear but not tanks, fermenters, or stills', () => {
    expect(isBottlingEquipmentType('pump')).toBe(true);
    expect(isBottlingEquipmentType('hose')).toBe(true);
    expect(isBottlingEquipmentType('other')).toBe(true);
    expect(isBottlingEquipmentType('bottling_machine')).toBe(true);
    expect(isBottlingEquipmentType('holding_tank')).toBe(false);
    expect(isBottlingEquipmentType('fermenter')).toBe(false);
    expect(isBottlingEquipmentType('pot_still')).toBe(false);

    const options = bottlingEquipmentOptions([
      item(1, 'Tank 1', 'holding_tank'),
      item(2, 'Pump B', 'pump'),
      item(3, 'Bottling Line', 'other', 'bottling_line'),
      item(4, 'Fermenter 1', 'fermenter'),
    ]);
    expect(options.map((o) => o.name)).toEqual(['Pump B']);
  });

  it('splits and merges bottling line vs auxiliary picks', () => {
    const equipment = [
      item(1, 'Line A', 'other', 'bottling_line'),
      item(2, 'Pump', 'pump'),
    ];
    expect(splitBottlingRunEquipmentIds([1, 2], equipment)).toEqual({ lineId: 1, auxiliaryIds: [2] });
    expect(mergeBottlingRunEquipmentIds(1, [2])).toEqual([1, 2]);
    expect(mergeBottlingRunEquipmentIds(null, [2])).toEqual([2]);
  });

  it('keeps an already-saved pick in the list', () => {
    const options = bottlingEquipmentOptions([item(1, 'Tank 1', 'holding_tank')], [1]);
    expect(options.map((o) => o.id)).toEqual([1]);
  });

  it('drops duplicates and blanks', () => {
    expect(uniqueEquipmentIds([3, 3, null, 0, 5])).toEqual([3, 5]);
    expect(uniqueEquipmentIds(undefined)).toEqual([]);
  });

  it('marks nothing dirty while planned', () => {
    expect(bottlingEquipmentToMarkDirty({
      selectedIds: [1, 2], previousIds: [], previousUsed: false, nowUsed: false, newSession: true,
    })).toEqual([]);
  });

  it('marks all picks dirty when the run starts', () => {
    expect(bottlingEquipmentToMarkDirty({
      selectedIds: [1, 2], previousIds: [1, 2], previousUsed: false, nowUsed: true, newSession: true,
    })).toEqual([1, 2]);
  });

  it('marks only new picks dirty on a plain edit, and all picks on a new session', () => {
    const base = { selectedIds: [1, 2], previousIds: [1], previousUsed: true, nowUsed: true };
    expect(bottlingEquipmentToMarkDirty({ ...base, newSession: false })).toEqual([2]);
    expect(bottlingEquipmentToMarkDirty({ ...base, newSession: true })).toEqual([1, 2]);
  });

  it('releases holds when the run goes back to planned or a pick is removed', () => {
    expect(bottlingEquipmentToRelease({
      selectedIds: [1], previousIds: [1, 2], previousUsed: true, nowUsed: false,
    })).toEqual([1, 2]);
    expect(bottlingEquipmentToRelease({
      selectedIds: [1], previousIds: [1, 2], previousUsed: true, nowUsed: true,
    })).toEqual([2]);
    expect(bottlingEquipmentToRelease({
      selectedIds: [], previousIds: [1], previousUsed: false, nowUsed: true,
    })).toEqual([]);
  });
});
