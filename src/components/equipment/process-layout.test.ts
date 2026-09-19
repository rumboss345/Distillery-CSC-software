import { describe, expect, it } from 'vitest';
import {
  PROCESS_GRID_SIZE,
  clampEquipmentProcessPosition,
  clampProcessPositionToStage,
  computeProcessLayoutPlan,
  computeStageBands,
  findNearestEmptySlot,
  positionToSlot,
  slotKey,
  sortStageItemsForProcessLayout,
  stageBandHeight,
  snapProcessPosition,
  snapToProcessGrid,
} from './process-layout';
import type { FloorEquipmentView } from '../../types';

describe('snapToProcessGrid', () => {
  it('snaps to nearest grid line', () => {
    expect(snapToProcessGrid(0)).toBe(0);
    expect(snapToProcessGrid(28)).toBe(28);
    expect(snapToProcessGrid(56)).toBe(56);
    expect(snapToProcessGrid(41)).toBe(28);
    expect(snapToProcessGrid(43)).toBe(56);
  });

  it('uses process layout gap as default grid size', () => {
    expect(PROCESS_GRID_SIZE).toBe(28);
    expect(snapToProcessGrid(100)).toBe(112);
  });
});

describe('snapProcessPosition', () => {
  it('snaps both axes', () => {
    expect(snapProcessPosition({ x: 41, y: 103 })).toEqual({ x: 28, y: 112 });
  });
});

describe('stage bands', () => {
  it('grows band height when a stage has many items', () => {
    expect(stageBandHeight(3)).toBeLessThan(stageBandHeight(8));
    const bands = computeStageBands([{ items: [1, 2] }, { items: [1, 2, 3, 4, 5, 6] }]);
    expect(bands[1].top).toBeGreaterThan(bands[0].top);
    expect(bands[1].height).toBeGreaterThan(bands[0].height);
  });
});

describe('clampProcessPositionToStage', () => {
  it('keeps position inside the stage band', () => {
    const band = { top: 100, height: 260 };
    const clamped = clampProcessPositionToStage({ x: 0, y: 50 }, band, 900);
    expect(clamped.y).toBeGreaterThanOrEqual(band.top + 44);
    expect(clamped.x).toBeGreaterThanOrEqual(32);
  });
});

describe('clampEquipmentProcessPosition', () => {
  it('clamps to the stage that contains the equipment id', () => {
    const stages = [
      { items: [{ id: 1 }] },
      { items: [{ id: 2 }] },
    ];
    const bands = computeStageBands(stages);
    const clamped = clampEquipmentProcessPosition(2, { x: 10, y: 10 }, stages, bands, 900);
    expect(clamped.y).toBeGreaterThanOrEqual(bands[1].top + 44);
    expect(clamped.y).toBeLessThanOrEqual(bands[1].top + bands[1].height);
  });
});

describe('tank volume order on process view', () => {
  it('sorts holding and collection vessels fullest first', () => {
    const items = [
      { id: 1, name: 'T-A', equipment_type: 'holding_tank', active_volume_gal: 10 },
      { id: 2, name: 'T-B', equipment_type: 'holding_tank', active_volume_gal: 50 },
      { id: 3, name: 'T-C', equipment_type: 'holding_tank', active_volume_gal: 50 },
    ] as FloorEquipmentView[];

    const sorted = sortStageItemsForProcessLayout('storage', items);
    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it('places fullest tank in the first grid slot', () => {
    const items = [
      { id: 1, name: 'Low', equipment_type: 'collection_vessel', active_volume_gal: 5 },
      { id: 2, name: 'High', equipment_type: 'collection_vessel', active_volume_gal: 90 },
    ] as FloorEquipmentView[];

    const plan = computeProcessLayoutPlan(items, 6);
    const band = plan.stageBands[0];
    const lowSlot = positionToSlot(plan.positions.get(1)!, band);
    const highSlot = positionToSlot(plan.positions.get(2)!, band);
    expect(highSlot).toEqual({ col: 0, row: 0 });
    expect(lowSlot).toEqual({ col: 1, row: 0 });
  });
});

describe('process slot layout', () => {
  it('finds the nearest empty slot when target is taken', () => {
    const occupied = new Set([slotKey(0, 0)]);
    const slot = findNearestEmptySlot({ col: 0, row: 0 }, 4, 2, occupied);
    expect(occupied.has(slotKey(slot.col, slot.row))).toBe(false);
  });

  it('assigns unique grid slots per item in a stage', () => {
    const items = [
      { id: 1, name: 'A', equipment_type: 'fermenter' },
      { id: 2, name: 'B', equipment_type: 'fermenter' },
      { id: 3, name: 'C', equipment_type: 'fermenter' },
    ] as FloorEquipmentView[];

    const plan = computeProcessLayoutPlan(items, 6);
    const band = plan.stageBands[0];
    const slots = items.map((item) => {
      const pos = plan.positions.get(item.id)!;
      return positionToSlot(pos, band);
    });
    const keys = slots.map((s) => slotKey(s.col, s.row));
    expect(new Set(keys).size).toBe(items.length);
  });
});
