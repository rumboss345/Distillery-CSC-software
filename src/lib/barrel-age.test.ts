import { describe, expect, it } from 'vitest';
import { barrelAgeParts, formatBarrelAge } from './barrel-age';

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