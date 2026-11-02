import { getBottlingRuns } from '../../db/queries';
import { bottlingCountsTowardProduction, packagingBottleCountsBySku, packagingLabelCountsBySku } from '../bottling-lines';
import { eventInReportRange, type ReportDateRange } from './period';
import { reportPersonMatches, type ReportEmployee } from './person';

export interface PackagingConsumptionRow {
  key: string;
  kind: 'bottle' | 'label';
  sku: string;
  quantity: number;
}

export function buildPackagingConsumption(
  range: ReportDateRange,
  employee: ReportEmployee | null = null,
): PackagingConsumptionRow[] {
  const bottleTotals: Record<string, number> = {};
  const labelTotals: Record<string, number> = {};

  for (const run of getBottlingRuns()) {
    if (!bottlingCountsTowardProduction(run.status)) continue;
    if (!eventInReportRange(run.bottling_date, range)) continue;
    if (!reportPersonMatches(run.variance_changed_by, employee)) continue;
    for (const [sku, qty] of Object.entries(packagingBottleCountsBySku(run.lines))) {
      bottleTotals[sku] = (bottleTotals[sku] ?? 0) + qty;
    }
    for (const [sku, qty] of Object.entries(packagingLabelCountsBySku(run.lines))) {
      labelTotals[sku] = (labelTotals[sku] ?? 0) + qty;
    }
  }

  const rows: PackagingConsumptionRow[] = [];
  for (const [sku, quantity] of Object.entries(bottleTotals).sort(([a], [b]) => a.localeCompare(b))) {
    rows.push({ key: `bottle:${sku}`, kind: 'bottle', sku, quantity });
  }
  for (const [sku, quantity] of Object.entries(labelTotals).sort(([a], [b]) => a.localeCompare(b))) {
    rows.push({ key: `label:${sku}`, kind: 'label', sku, quantity });
  }
  return rows;
}
