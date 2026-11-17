import { describe, expect, it } from 'vitest';
import type { BottlingReportRow } from '../reporting/bottling-rows';
import {
  bottlingByProduct,
  chartTimeBuckets,
  inventoryTrend,
  productionVolumeSeries,
  productionVolumeSeriesForRange,
  recentMonths,
  yieldSeries,
  yieldSeriesForRange,
} from './charts';
import { resolveReportPeriod } from '../reporting/period';

describe('dashboard chart series', () => {
  it('lists the last months oldest first', () => {
    expect(recentMonths('2026-02-14', 3).map((point) => point.month)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('fills months with no production with zero', () => {
    const series = productionVolumeSeries(
      [{ month: '2026-10', heartsGal: 120.04, pureAlcoholGal: 80, bottles: 300, runs: 2, fermentations: 3 } as never],
      '2026-11-14',
      3,
    );
    expect(series.map((point) => point.heartsGal)).toEqual([0, 120.04, 0]);
  });

  it('totals bottles by product and size', () => {
    const rows = [
      { product_name: 'Gold', bottle_count: 10, bottled_gal: 2, bottle_sizes: [{ sizeMl: 750, count: 10 }] },
      { product_name: 'Gold', bottle_count: 5, bottled_gal: 1, bottle_sizes: [{ sizeMl: 375, count: 5 }] },
      { product_name: 'White', bottle_count: 20, bottled_gal: 4, bottle_sizes: [{ sizeMl: 750, count: 20 }] },
      { product_name: 'Empty', bottle_count: 0, bottled_gal: 0, bottle_sizes: [] },
    ] as unknown as BottlingReportRow[];
    const points = bottlingByProduct(rows);
    expect(points.map((point) => [point.product, point.bottles])).toEqual([['White', 20], ['Gold', 15]]);
    expect(points[1].sizes).toEqual([{ sizeMl: 750, count: 10 }, { sizeMl: 375, count: 5 }]);
  });

  it('compares alcohol charged and collected per month, skipping runs without both', () => {
    const series = yieldSeries(
      [
        { run_date: '2026-11-02', charged_laa_gal: 50, collected_laa_gal: 45 },
        { run_date: '2026-11-09', charged_laa_gal: 50, collected_laa_gal: null },
      ],
      '2026-11-14',
      2,
    );
    expect(series[0].yieldPct).toBeNull();
    expect(series[1]).toMatchObject({ expectedLaaGal: 50, actualLaaGal: 45, yieldPct: 90 });
  });

  it('uses one column for today and daily buckets for a short week', () => {
    const today = resolveReportPeriod('today');
    expect(chartTimeBuckets(today, '2026-11-17')).toEqual([{ month: '2026-11-17', label: 'Nov 17' }]);
    const week = resolveReportPeriod('week');
    const days = chartTimeBuckets(week, '2026-11-17');
    expect(days.length).toBeGreaterThan(0);
    expect(days[0].month).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('totals hearts for the selected period only', () => {
    const lastMonth = resolveReportPeriod('lastMonth');
    const series = productionVolumeSeriesForRange(
      [{ month: '2026-10', heartsGal: 80, pureAlcoholGal: 40, bottles: 0, runs: 1, fermentations: 0 } as never],
      lastMonth,
      '2026-11-17',
      [
        { run_date: '2026-10-05', hearts_gal: 80 },
        { run_date: '2026-11-05', hearts_gal: 200 },
      ],
    );
    const hearts = series.reduce((sum, point) => sum + point.heartsGal, 0);
    expect(hearts).toBeCloseTo(80);
  });

  it('limits yield to the selected period', () => {
    const month = resolveReportPeriod('month');
    const series = yieldSeriesForRange(
      [
        { run_date: '2026-11-02', charged_laa_gal: 50, collected_laa_gal: 45 },
        { run_date: '2026-10-02', charged_laa_gal: 100, collected_laa_gal: 90 },
      ],
      month,
      '2026-11-17',
    );
    const totalActual = series.reduce((sum, point) => sum + point.actualLaaGal, 0);
    expect(totalActual).toBeCloseTo(45);
  });

  it('works inventory back from today’s count', () => {
    const points = inventoryTrend(
      [
        { delta: -10, created_at: '2026-11-13T10:00:00' },
        { delta: 25, created_at: '2026-11-12T10:00:00' },
      ],
      40,
      '2026-11-14',
      4,
    );
    expect(points).toEqual([
      { date: '2026-11-11', quantity: 25 },
      { date: '2026-11-12', quantity: 50 },
      { date: '2026-11-13', quantity: 40 },
      { date: '2026-11-14', quantity: 40 },
    ]);
  });
});
