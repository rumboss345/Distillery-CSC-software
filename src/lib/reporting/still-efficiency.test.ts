import { describe, expect, it } from 'vitest';
import { buildStillEfficiencyByRunType } from './still-efficiency';
import type { ReportDateRange } from './period';

const allTime: ReportDateRange = { preset: 'all', label: 'All time', from: null, to: null };

describe('buildStillEfficiencyByRunType', () => {
  it('returns an empty list when there are no completed runs', () => {
    expect(buildStillEfficiencyByRunType(allTime)).toEqual([]);
  });
});
