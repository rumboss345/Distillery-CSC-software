import { describe, expect, it } from 'vitest';
import { formatKpiDelta, priorReportPeriod } from './owner-kpis';
import { resolveReportPeriod } from './period';

describe('priorReportPeriod', () => {
  it('maps this month to last month', () => {
    const current = resolveReportPeriod('month', undefined, undefined, new Date('2026-06-15'));
    const prior = priorReportPeriod(current, new Date('2026-06-15'));
    expect(prior?.from).toBe('2026-05-01');
    expect(prior?.to).toBe('2026-05-31');
  });

  it('returns null for all time', () => {
    const all = resolveReportPeriod('all');
    expect(priorReportPeriod(all)).toBeNull();
  });
});

describe('formatKpiDelta', () => {
  it('shows percent change when prior is non-zero', () => {
    expect(formatKpiDelta({ current: 110, previous: 100 })).toBe('+10% vs prior (+10)');
  });

  it('returns null when there is no prior period', () => {
    expect(formatKpiDelta({ current: 5, previous: null })).toBeNull();
  });
});
