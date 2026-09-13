import { describe, expect, it } from 'vitest';
import {
  PROCESS_GRID_SIZE,
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
