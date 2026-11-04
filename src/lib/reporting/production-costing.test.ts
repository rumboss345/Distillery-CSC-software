import { describe, expect, it } from 'vitest';
import { buildProductionCostReport } from './production-costing';
import { DEFAULT_PRODUCTION_COST_SETTINGS } from '../../db/queries';
import type { ReportDateRange } from './period';

const allTime: ReportDateRange = { preset: 'all', label: 'All time', from: null, to: null };

describe('buildProductionCostReport', () => {
  it('returns empty sections without throwing when no production data exists', () => {
    const report = buildProductionCostReport(allTime, DEFAULT_PRODUCTION_COST_SETTINGS);
    expect(report.summary.totalCost).toBe(0);
    expect(report.summary.totalWaterCost).toBe(0);
    expect(report.summary.totalMonthlyLabourCost).toBe(0);
    expect(report.washBatches).toEqual([]);
    expect(report.bottlingRuns).toEqual([]);
  });
});
