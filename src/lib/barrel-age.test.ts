import { describe, expect, it } from 'vitest';
import {
  barrelAgeParts,
  barrelFillDateAfterSoleraTop,
  formatBarrelAge,
  formatBarrelAgeForBarrel,
  volumeWeightedAverageFillDate,
} from './barrel-age';

const TODAY = new Date('2026-11-23T12:00:00');

describe('barrelAgeParts', () => {
  it('returns null for invalid fill dates', () => {
    expect(barrelAgeParts('', TODAY)).toBeNull();
    expect(barrelAgeParts('not-a-date', TODAY)).toBeNull();
  });

  it('counts from fill day as zero days', () => {
    expect(barrelAgeParts('2026-11-23', TODAY)).toEqual({ years: 0, months: 0, days: 0 });
    expect(formatBarrelAge('2026-11-23', TODAY)).toBe('0 days');
  });

  it('splits years, months, and days on the calendar', () => {
    expect(barrelAgeParts('2024-03-15', TODAY)).toEqual({ years: 2, months: 8, days: 8 });
    expect(formatBarrelAge('2024-03-15', TODAY)).toBe('2 years, 8 months, 8 days');
  });

  it('omits zero year and month units when young', () => {
    expect(formatBarrelAge('2026-10-01', TODAY)).toBe('1 month, 22 days');
    expect(formatBarrelAge('2026-11-10', TODAY)).toBe('13 days');
  });
});

describe('formatBarrelAgeForBarrel', () => {
  it('shows zero age when empty or dumped even if fill_date is old', () => {
    const oldFill = { fill_date: '2020-01-01', status: 'empty' as const, current_volume_gal: 0 };
    expect(formatBarrelAgeForBarrel(oldFill, TODAY)).toBe('0 days');
    expect(formatBarrelAgeForBarrel({ ...oldFill, status: 'dumped' }, TODAY)).toBe('0 days');
  });

  it('shows zero when status is aging but volume is gone', () => {
    expect(formatBarrelAgeForBarrel(
      { fill_date: '2020-01-01', status: 'aging', current_volume_gal: 0 },
      TODAY,
    )).toBe('0 days');
  });

  it('uses fill date when spirit is in the barrel', () => {
    expect(formatBarrelAgeForBarrel(
      { fill_date: '2024-03-15', status: 'aging', current_volume_gal: 40 },
      TODAY,
    )).toBe('2 years, 8 months, 8 days');
  });
});

describe('volumeWeightedAverageFillDate', () => {
  const asOf = new Date('2026-06-01T12:00:00');

  it('volume-weights calendar age from fill dates', () => {
    const avg = volumeWeightedAverageFillDate([
      { volume_gal: 10, fill_date: '2020-06-01' },
      { volume_gal: 20, fill_date: '2024-06-01' },
    ], asOf);
    expect(avg).toBe('2023-01-31');
  });
});

describe('barrelFillDateAfterSoleraTop', () => {
  const asOf = new Date('2026-06-01T12:00:00');
  const pulledAverage = '2023-01-31';

  it('sets an empty solera barrel to the pulled spirit average age', () => {
    expect(barrelFillDateAfterSoleraTop(0, '2010-01-01', 12, pulledAverage, asOf)).toBe(pulledAverage);
  });

  it('blends age when topping a barrel that still has volume', () => {
    const blended = barrelFillDateAfterSoleraTop(40, '2020-06-01', 20, pulledAverage, asOf);
    expect(blended).toBe('2021-04-22');
  });
});