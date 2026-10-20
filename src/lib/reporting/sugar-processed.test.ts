import { describe, expect, it } from 'vitest';
import { totalSugarProcessedLbs, type SugarUse } from './sugar-processed';
import type { ReportDateRange } from './period';

const june: ReportDateRange = {
  preset: 'custom',
  from: '2025-06-01',
  to: '2025-06-30',
  label: 'June 2025',
};

const allTime: ReportDateRange = {
  preset: 'all',
  from: null,
  to: null,
  label: 'All time',
};

const uses: SugarUse[] = [
  { occurredAt: '2025-06-01', sugarLbs: 400 },
  { occurredAt: '2025-06-15', sugarLbs: 750 },
  { occurredAt: '2025-07-01', sugarLbs: 200 },
  { occurredAt: '2025-06-20', sugarLbs: 0 },
  { occurredAt: '2025-06-18T15:00:00Z', sugarLbs: 50 },
];

describe('total sugar processed', () => {
  it('counts sugar used on washes and in blends, including a wash that has not made hearts', () => {
    expect(totalSugarProcessedLbs(uses, june)).toBe(1200);
    expect(totalSugarProcessedLbs(uses, allTime)).toBe(1400);
  });

  it('leaves out sugar used outside the report period', () => {
    const october: ReportDateRange = {
      preset: 'month',
      from: '2026-10-01',
      to: '2026-10-31',
      label: 'October 2026',
    };
    expect(totalSugarProcessedLbs(uses, october)).toBe(0);
  });
});
