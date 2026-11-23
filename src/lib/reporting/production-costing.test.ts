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
    expect(report.summary.totalMonthlyOverheadCost).toBe(0);
    expect(report.summary.totalWashPipelineCost).toBe(0);
    expect(report.summary.costPerLaaLiterFullProduction).toBeNull();
    expect(report.summary.alcoholCollectedLaaLiters).toBe(0);
    expect(report.washBatches).toEqual([]);
    expect(report.bottlingRuns).toEqual([]);
    expect(report.spendBreakdowns.materials).toEqual([]);
    expect(report.spendBreakdowns.processWater).toEqual([]);
    expect(report.waterCostPerGal).toBe(DEFAULT_PRODUCTION_COST_SETTINGS.water_cost_per_gal ?? 0);
  });
});
