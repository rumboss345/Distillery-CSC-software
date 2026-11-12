import { describe, expect, it } from 'vitest';
import { fullCalendarMonthKey } from './period';

describe('fullCalendarMonthKey', () => {
  it('returns YYYY-MM only for an exact calendar month', () => {
    expect(fullCalendarMonthKey({ from: '2026-06-01', to: '2026-06-30' })).toBe('2026-06');
    expect(fullCalendarMonthKey({ from: '2026-06-01', to: '2026-06-15' })).toBeNull();
    expect(fullCalendarMonthKey({ from: '2026-06-15', to: '2026-06-30' })).toBeNull();
    expect(fullCalendarMonthKey({ from: '2026-06-01', to: '2026-07-31' })).toBeNull();
    expect(fullCalendarMonthKey({ from: null, to: null })).toBeNull();
  });
});
