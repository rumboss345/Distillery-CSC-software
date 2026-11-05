import { describe, expect, it } from 'vitest';
import { worksheetOnePageScale, worksheetPageSlices } from './worksheet-pages';

describe('worksheetOnePageScale', () => {
  it('keeps a worksheet that already fits at full size', () => {
    expect(worksheetOnePageScale(900, 1000)).toBe(1);
  });

  it('shrinks any tall worksheet onto one page', () => {
    expect(worksheetOnePageScale(1250, 1000)).toBeCloseTo(0.8, 5);
    expect(worksheetOnePageScale(1400, 1000)).toBeCloseTo(1000 / 1400, 5);
    expect(worksheetOnePageScale(1600, 1000)).toBeCloseTo(0.625, 5);
  });
});

describe('worksheetPageSlices', () => {
  it('ends each page at the last row or section that fits', () => {
    const slices = worksheetPageSlices(2300, 1000, [0, 300, 650, 940, 1020, 1500, 1880, 2100]);
    expect(slices).toEqual([
      { start: 0, end: 940 },
      { start: 940, end: 1880 },
      { start: 1880, end: 2300 },
    ]);
  });

  it('never ends a page in the middle of a row when a break point fits', () => {
    const breaks = [120, 480, 760, 990, 1240, 1610];
    const slices = worksheetPageSlices(1800, 1000, breaks);
    for (const slice of slices.slice(0, -1)) {
      expect(breaks).toContain(slice.end);
    }
    expect(slices[slices.length - 1].end).toBe(1800);
  });

  it('cuts at the page height only when one block is taller than half a page', () => {
    const slices = worksheetPageSlices(2000, 1000, [200]);
    expect(slices[0]).toEqual({ start: 0, end: 1000 });
  });

  it('returns one page when everything fits', () => {
    expect(worksheetPageSlices(800, 1000, [100, 400])).toEqual([{ start: 0, end: 800 }]);
  });
});
