import { describe, expect, it } from 'vitest';
import { eventInReportRange, resolveReportPeriod } from './period';

describe('report period', () => {
  it('resolves today preset', () => {
    const range = resolveReportPeriod('today', undefined, undefined, new Date('2025-06-15T15:00:00'));
    expect(range.from).toBe('2025-06-15');
    expect(range.to).toBe('2025-06-15');
  });

  it('resolves last month, including a year boundary', () => {
    const october = resolveReportPeriod('lastMonth', undefined, undefined, new Date(2026, 9, 9));
    expect(october).toMatchObject({
      preset: 'lastMonth',
      from: '2026-09-01',
      to: '2026-09-30',
      label: 'September 2026',
    });
    const january = resolveReportPeriod('lastMonth', undefined, undefined, new Date(2026, 0, 15));
    expect(january.from).toBe('2025-12-01');
    expect(january.to).toBe('2025-12-31');
    expect(january.label).toBe('December 2025');
  });

  it('filters events inclusively by day', () => {
    const range = { from: '2025-06-01', to: '2025-06-30' };
    expect(eventInReportRange('2025-06-01T08:00:00', range)).toBe(true);
    expect(eventInReportRange('2025-06-30T23:59:00', range)).toBe(true);
    expect(eventInReportRange('2025-05-31', range)).toBe(false);
    expect(eventInReportRange('2025-07-01', range)).toBe(false);
  });

  it('all time accepts any dated event', () => {
    expect(eventInReportRange('2020-01-01', { from: null, to: null })).toBe(true);
  });
});
