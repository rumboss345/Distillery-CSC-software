import { describe, expect, it } from 'vitest';
import {
  PROCESS_GRID_SIZE,
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
