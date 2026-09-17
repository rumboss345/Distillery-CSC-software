import { describe, expect, it } from 'vitest';
import {
  PROCESS_GRID_SIZE,
  clampEquipmentProcessPosition,
  clampProcessPositionToStage,
  computeStageBands,
  stageBandHeight,
  snapProcessPosition,
  snapToProcessGrid,
} from './process-layout';

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
