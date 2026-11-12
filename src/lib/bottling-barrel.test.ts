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

  it('resets fill date after solera only when the barrel was empty', () => {
    expect(barrelFillDateAfterSoleraTop(0, '2020-01-01')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(barrelFillDateAfterSoleraTop(10, '2020-01-01')).toBe('2020-01-01');
  });
});
