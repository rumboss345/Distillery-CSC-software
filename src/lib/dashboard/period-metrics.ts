import { buildBottlingReportRows } from '../reporting/bottling-rows';
import { buildDistillationReportRows } from '../reporting/distillation-rows';
import type { ReportDateRange } from '../reporting/period';

export interface DashboardPeriodMetrics {
  totalHeartsGal: number;
  bottleCount: number;
  bottlesBySize: { sizeMl: number; count: number }[];
}

/** Hearts and bottles tied to the dashboard Period selector. */
export function dashboardPeriodMetrics(range: ReportDateRange): DashboardPeriodMetrics {
  const totalHeartsGal = buildDistillationReportRows(range)
    .filter((row) => row.status === 'complete')
    .reduce((sum, row) => sum + row.hearts_gal, 0);

  const sizeMap = new Map<number, number>();
  let bottleCount = 0;
  for (const row of buildBottlingReportRows(range)) {
    bottleCount += row.bottle_count;
    for (const size of row.bottle_sizes) {
      sizeMap.set(size.sizeMl, (sizeMap.get(size.sizeMl) ?? 0) + size.count);
    }
  }

  const bottlesBySize = [...sizeMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([sizeMl, count]) => ({ sizeMl, count }));

  return { totalHeartsGal, bottleCount, bottlesBySize };
}