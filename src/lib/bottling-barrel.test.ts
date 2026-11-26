import { describe, expect, it } from 'vitest';
import {
  barrelBottlingDrawGal,
  barrelBottlingHeadroomGal,
  barrelFillDateAfterSoleraTop,
  barrelStatusAfterVolume,
  barrelVolumeAfterDraw,
  barrelVolumeAfterRestore,
  bottledVolumeFromBottlingLines,
} from './bottling-barrel';

describe('barrel bottling volume', () => {
  it('draws nothing while planned', () => {
    expect(barrelBottlingDrawGal('planned', 5)).toBe(0);
    expect(barrelBottlingDrawGal('running', 5)).toBe(5);
    expect(barrelBottlingDrawGal('complete', 5)).toBe(5);
  });

  it('measures bottled gallons from packaging lines', () => {
    expect(bottledVolumeFromBottlingLines([
      { bottle_count: 12, bottle_size_ml: 750 },
    ])).toBeCloseTo(2.377, 2);
  });

  it('adds back the previous draw when editing the same barrel', () => {
    expect(barrelBottlingHeadroomGal(4, 2, true)).toBeCloseTo(6, 3);
    expect(barrelBottlingHeadroomGal(4, 2, false)).toBeCloseTo(4, 3);
  });

  it('empties the barrel when volume drops below a trace', () => {
    expect(barrelVolumeAfterRestore(3, 2)).toBe(5);
    expect(barrelVolumeAfterDraw(5, 5)).toBe(0);
    expect(barrelStatusAfterVolume(0)).toBe('empty');
    expect(barrelStatusAfterVolume(0.5)).toBe('aging');
  });

  it('uses pulled spirit average fill date when the barrel was empty', () => {
    const asOf = new Date('2026-06-01T12:00:00');
    expect(barrelFillDateAfterSoleraTop(0, '2020-01-01', 8, '2019-06-01', asOf)).toBe('2019-06-01');
    expect(barrelFillDateAfterSoleraTop(10, '2020-01-01', 8, '2019-06-01', asOf)).toBe('2019-09-28');
  });
});
