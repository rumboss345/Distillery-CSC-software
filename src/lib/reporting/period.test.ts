import { describe, expect, it } from 'vitest';
import { calendarMonthInReportRange } from './period';

describe('calendarMonthInReportRange', () => {
  it('includes a month when any day overlaps the range', () => {
    expect(calendarMonthInReportRange('2026-11', { from: '2026-11-15', to: '2026-12-01' })).toBe(true);
    expect(calendarMonthInReportRange('2026-10', { from: '2026-11-15', to: '2026-12-01' })).toBe(false);
  });

  it('includes every month when the report has no bounds', () => {
    expect(calendarMonthInReportRange('2020-01', { from: null, to: null })).toBe(true);
  });
});
