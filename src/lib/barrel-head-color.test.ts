import { describe, expect, it } from 'vitest';
import {
  BARREL_AGE_COLOR_MONTHS,
  BARREL_HEAD_AGED,
  BARREL_HEAD_DUMPED,
  BARREL_HEAD_EMPTY,
  BARREL_HEAD_YOUNG,
  barrelAgingMonths,
  barrelHeadFill,
  barrelHeadInk,
} from './barrel-head-color';

const TODAY = new Date(2026, 9, 16);

describe('barrel aging colour', () => {
  it('starts light gold in the fill month', () => {
    expect(barrelAgingMonths('2026-10-01', TODAY)).toBe(0);
    expect(barrelHeadFill({
      status: 'aging',
      volumeGal: 53,
      fillDate: '2026-10-16',
      today: TODAY,
    })).toBe(BARREL_HEAD_YOUNG);
  });

  it('steps darker each calendar month and reaches dark brown at 24 months', () => {
    const young = barrelHeadFill({
      status: 'aging',
      volumeGal: 40,
      fillDate: '2026-10-16',
      today: TODAY,
    });
    const oneMonth = barrelHeadFill({
      status: 'aging',
      volumeGal: 40,
      fillDate: '2026-09-16',
      today: TODAY,
    });
    const twoYears = barrelHeadFill({
      status: 'aging',
      volumeGal: 40,
      fillDate: '2024-10-16',
      today: TODAY,
    });
    const older = barrelHeadFill({
      status: 'aging',
      volumeGal: 40,
      fillDate: '2020-01-01',
      today: TODAY,
    });
    expect(barrelAgingMonths('2026-09-16', TODAY)).toBe(1);
    expect(barrelAgingMonths('2024-10-16', TODAY)).toBe(BARREL_AGE_COLOR_MONTHS);
    expect(oneMonth).not.toBe(young);
    expect(twoYears).toBe(BARREL_HEAD_AGED);
    expect(older).toBe(BARREL_HEAD_AGED);
    expect(barrelHeadInk(young).number).toBe('#2a1c12');
    expect(barrelHeadInk(twoYears).number).toBe('#f4e6c8');
  });

  it('keeps empty and dumped heads out of the age ramp', () => {
    expect(barrelHeadFill({
      status: 'empty',
      volumeGal: 0,
      fillDate: '2020-01-01',
      today: TODAY,
    })).toBe(BARREL_HEAD_EMPTY);
    expect(barrelHeadFill({
      status: 'aging',
      volumeGal: 0,
      fillDate: '2020-01-01',
      today: TODAY,
    })).toBe(BARREL_HEAD_EMPTY);
    expect(barrelHeadFill({
      status: 'dumped',
      volumeGal: 10,
      fillDate: '2020-01-01',
      today: TODAY,
    })).toBe(BARREL_HEAD_DUMPED);
  });
});
