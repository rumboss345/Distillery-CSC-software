import { queryAll } from '../../db/sql-session';
import { isIsoDate } from '../date-input';
import { localIsoDate } from '../planned-event-date';
import { buildFermentationHistoryRows, type FermentationHistoryRow } from './fermentation-rows';
import type { ReportDateRange } from './period';

export interface FermentationPerformanceRow extends FermentationHistoryRow {
  duration_days: number | null;
  expected_completion_date: string | null;
  overdue_days: number;
}

export interface FermentationPerformanceSummary {
  rows: FermentationPerformanceRow[];
  avg_duration_days: number | null;
  avg_brix_drop: number | null;
  overdue_count: number;
}

function daysBetween(start: string, end: string): number | null {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return null;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}

function reportPeriodEnd(range: ReportDateRange): string {
  const end = range.to?.trim().slice(0, 10) ?? '';
  return isIsoDate(end) ? end : localIsoDate();
}

function loadMashSchedule(): Map<number, {
  fermentation_start_date: string | null;
  expected_completion_date: string | null;
}> {
  const rows = queryAll<{
    id: number;
    fermentation_start_date: string | null;
    expected_completion_date: string | null;
  }>(`
    SELECT id, fermentation_start_date, expected_completion_date FROM mash_batches
  `);
  return new Map(rows.map((row) => [row.id, {
    fermentation_start_date: row.fermentation_start_date,
    expected_completion_date: row.expected_completion_date,
  }]));
}

function loadEndDates(): Map<string, string> {
  const endDates = new Map<string, string>();
  const runs = queryAll<{
    mash_batch_id: number;
    floor_equipment_id: number;
    run_date: string;
  }>(`
    SELECT source_mash_batch_id as mash_batch_id,
           source_fermenter_equipment_id as floor_equipment_id,
           run_date
    FROM distillation_runs
    WHERE run_type IN ('wash', 'heavy_rum')
      AND source_mash_batch_id IS NOT NULL
      AND source_fermenter_equipment_id IS NOT NULL
    ORDER BY run_date ASC, id ASC
  `);
  for (const run of runs) {
    const key = `${run.mash_batch_id}:${run.floor_equipment_id}`;
    if (!endDates.has(key)) endDates.set(key, run.run_date.slice(0, 10));
  }
  return endDates;
}

function overdueDays(
  status: string,
  expected: string | null,
  endDate: string,
  periodEnd: string,
): number {
  const expectedDay = expected?.trim().slice(0, 10) ?? '';
  if (!isIsoDate(expectedDay)) return 0;
  if (status === 'fermenting') {
    const asOf = periodEnd < endDate ? periodEnd : endDate;
    if (asOf <= expectedDay) return 0;
    return daysBetween(expectedDay, asOf) ?? 0;
  }
  if (endDate > expectedDay) return daysBetween(expectedDay, endDate) ?? 0;
  return 0;
}

export function buildFermentationPerformance(range: ReportDateRange): FermentationPerformanceSummary {
  const periodEnd = reportPeriodEnd(range);
  const endDates = loadEndDates();
  const schedule = loadMashSchedule();
  const history = buildFermentationHistoryRows(range);

  const rows: FermentationPerformanceRow[] = history.map((row) => {
    const mashSchedule = schedule.get(row.mash_id);
    const fermentStart = mashSchedule?.fermentation_start_date?.slice(0, 10)
      || row.start_date.slice(0, 10);
    const endKey = row.fermenter_equipment_id != null
      ? `${row.mash_id}:${row.fermenter_equipment_id}`
      : '';
    const distilledEnd = endKey ? endDates.get(endKey) : undefined;
    const endDate = distilledEnd
      ?? (row.status === 'fermenting' ? periodEnd : row.start_date.slice(0, 10));
    const duration = daysBetween(fermentStart, endDate);
    const expected = mashSchedule?.expected_completion_date ?? null;
    const overdue = overdueDays(row.status, expected, endDate, periodEnd);
    return {
      ...row,
      duration_days: duration,
      expected_completion_date: expected,
      overdue_days: overdue,
    };
  });

  const finished = rows.filter((row) => row.duration_days != null && row.status !== 'fermenting');
  const avgDuration = finished.length > 0
    ? finished.reduce((sum, row) => sum + (row.duration_days ?? 0), 0) / finished.length
    : null;
  const withBrix = rows.filter((row) => row.start_brix != null && row.finish_brix != null);
  const avgBrixDrop = withBrix.length > 0
    ? withBrix.reduce((sum, row) => sum + ((row.start_brix ?? 0) - (row.finish_brix ?? 0)), 0) / withBrix.length
    : null;

  return {
    rows,
    avg_duration_days: avgDuration != null ? Math.round(avgDuration * 10) / 10 : null,
    avg_brix_drop: avgBrixDrop != null ? Math.round(avgBrixDrop * 10) / 10 : null,
    overdue_count: rows.filter((row) => row.overdue_days > 0).length,
  };
}
