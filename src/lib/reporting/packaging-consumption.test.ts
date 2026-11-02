import { describe, expect, it } from 'vitest';
import { buildPackagingConsumption } from './packaging-consumption';
import type { ReportDateRange } from './period';

const allTime: ReportDateRange = { preset: 'all', label: 'All time', from: null, to: null };

describe('buildPackagingConsumption', () => {
  it('returns sorted rows without throwing when no bottling runs exist', () => {
    expect(buildPackagingConsumption(allTime)).toEqual([]);
  });
});
