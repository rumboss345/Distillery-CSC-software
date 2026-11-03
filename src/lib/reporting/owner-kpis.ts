import { differenceInCalendarDays, format, subDays, subMonths, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import {
  getAllMashFermenterAssignments,
  getBarrels,
  getBottlingRuns,
  getDistillationRuns,
  getEquipmentVolumeReport,
  getInventoryItems,
  getMashBatches,
  getProductionSummary,
  getYieldReports,
} from '../../db/queries';
import { queryAll } from '../../db/database';
import { laaGalFromVolumeAbv } from './alcohol-units';
import { buildProductionExceptions } from './exceptions';
import { listOverdueFermentations } from '../fermentation';
import { localIsoDate } from '../planned-event-date';
import { eventInReportRange, resolveReportPeriod, type ReportDateRange } from './period';
import { bottlingCountsTowardProduction } from '../bottling-lines';

export interface KpiComparison {
  current: number;
  previous: number | null;
}

export interface OwnerKpiSnapshot {
  spiritOnHandLaa: number;
  holdingTanksWithSpirit: number;
  activeFermentations: number;
  washesInProgress: number;
  distillationActive: number;
  barrelsAging: number;
  overdueFermentations: number;
  lowStockItems: number;
  heartsGal: KpiComparison;
  bottlesFilled: KpiComparison;
  gpaProduced: KpiComparison;
  completedRuns: KpiComparison;
  exceptions: KpiComparison;
  priorPeriodLabel: string | null;
}

function toIsoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Range immediately before this one, for period-over-period KPIs. */
export function priorReportPeriod(range: ReportDateRange, now = new Date()): ReportDateRange | null {
  const today = startOfDay(now);
  switch (range.preset) {
    case 'today':
      return resolveReportPeriod('yesterday', undefined, undefined, now);
    case 'yesterday': {
      const day = subDays(today, 2);
      const d = toIsoDate(day);
      return { preset: 'custom', from: d, to: d, label: format(day, 'MMM d, yyyy') };
    }
    case 'week': {
      const thisWeekStart = startOfWeek(today, { weekStartsOn: 0 });
      const prevEnd = subDays(thisWeekStart, 1);
      const prevStart = startOfWeek(prevEnd, { weekStartsOn: 0 });
      return {
        preset: 'custom',
        from: toIsoDate(prevStart),
        to: toIsoDate(endOfWeek(prevEnd, { weekStartsOn: 0 })),
        label: 'Prior week',
      };
    }
    case 'month':
      return resolveReportPeriod('lastMonth', undefined, undefined, now);
    case 'lastMonth': {
      const anchor = range.from ? startOfDay(new Date(`${range.from}T12:00:00`)) : subMonths(today, 1);
      const prev = subMonths(startOfMonth(anchor), 1);
      return {
        preset: 'custom',
        from: toIsoDate(startOfMonth(prev)),
        to: toIsoDate(endOfMonth(prev)),
        label: format(prev, 'MMMM yyyy'),
      };
    }
    case 'custom': {
      if (!range.from || !range.to) return null;
      const from = startOfDay(new Date(`${range.from}T12:00:00`));
      const to = startOfDay(new Date(`${range.to}T12:00:00`));
      const spanDays = differenceInCalendarDays(to, from) + 1;
      const prevTo = subDays(from, 1);
      const prevFrom = subDays(prevTo, spanDays - 1);
      return {
        preset: 'custom',
        from: toIsoDate(prevFrom),
        to: toIsoDate(prevTo),
        label: 'Prior period',
      };
    }
    case 'all':
    default:
      return null;
  }
}

function heartsGalInRange(range: ReportDateRange): number {
  const runs = getDistillationRuns().filter((r) => eventInReportRange(r.run_date, range));
  if (runs.length === 0) return 0;
  const placeholders = runs.map(() => '?').join(',');
  const row = queryAll<{ total: number }>(
    `SELECT COALESCE(SUM(volume_gal), 0) as total FROM distillation_cuts
     WHERE cut_type = 'hearts' AND distillation_run_id IN (${placeholders})`,
    runs.map((r) => r.id),
  );
  return row[0]?.total ?? 0;
}

function gpaProducedInRange(range: ReportDateRange): number {
  const monthParam =
    range.from?.slice(0, 7) === range.to?.slice(0, 7) && range.from
      ? range.from.slice(0, 7)
      : undefined;
  const runs = getDistillationRuns();
  const mashes = getMashBatches();
  const mashIdsInRange = new Set(
    runs
      .filter((r) => eventInReportRange(r.run_date, range) && r.source_mash_batch_id)
      .map((r) => r.source_mash_batch_id as number),
  );
  const mashBatchNumbersInRange = new Set(
    mashes.filter((m) => mashIdsInRange.has(m.id)).map((m) => m.batch_number),
  );
  const yieldsAll = getYieldReports(monthParam);
  const yields = monthParam
    ? yieldsAll
    : yieldsAll.filter((y) => mashBatchNumbersInRange.has(y.mashBatchNumber));
  return yields.reduce((sum, y) => sum + y.gpa, 0);
}

function bottlesInRange(range: ReportDateRange): number {
  return getBottlingRuns()
    .filter((b) => bottlingCountsTowardProduction(b.status) && eventInReportRange(b.bottling_date, range))
    .reduce(
      (sum, b) => sum + (b.lines.reduce((n, l) => n + l.bottle_count, 0) || b.bottle_count),
      0,
    );
}

function completedRunsInRange(range: ReportDateRange): number {
  return getDistillationRuns().filter(
    (r) => r.status === 'complete' && eventInReportRange(r.run_date, range),
  ).length;
}

function exceptionsInRange(range: ReportDateRange): number {
  return buildProductionExceptions(range).length;
}

function compare(currentRange: ReportDateRange, previousRange: ReportDateRange | null, value: (r: ReportDateRange) => number): KpiComparison {
  const current = value(currentRange);
  const previous = previousRange ? value(previousRange) : null;
  return { current, previous };
}

export function buildOwnerKpis(range: ReportDateRange, now = new Date()): OwnerKpiSnapshot {
  const prior = priorReportPeriod(range, now);
  const floor = getProductionSummary();
  const equipment = getEquipmentVolumeReport().filter(
    (eq) => eq.equipment_type === 'holding_tank' || eq.equipment_type === 'collection_vessel',
  );
  const spiritOnHandLaa = equipment.reduce(
    (sum, eq) => sum + laaGalFromVolumeAbv(eq.volume_gal, eq.abv ?? 0),
    0,
  );
  const holdingTanksWithSpirit = equipment.filter((eq) => eq.volume_gal > 0.01).length;

  const mashes = getMashBatches();
  const washesInProgress = mashes.filter((m) => m.status === 'mashing' || m.status === 'fermenting').length;
  const overdue = listOverdueFermentations(
    getAllMashFermenterAssignments(),
    mashes,
    localIsoDate(),
  );
  const lowStockItems = getInventoryItems().filter((i) => i.quantity <= i.reorder_level).length;
  const barrelsAging = getBarrels().filter((b) => b.status === 'aging').length;

  return {
    spiritOnHandLaa: Math.round(spiritOnHandLaa * 100) / 100,
    holdingTanksWithSpirit,
    activeFermentations: floor.activeFermentations,
    washesInProgress,
    distillationActive: floor.activeRuns,
    barrelsAging,
    overdueFermentations: overdue.length,
    lowStockItems,
    heartsGal: compare(range, prior, heartsGalInRange),
    bottlesFilled: compare(range, prior, bottlesInRange),
    gpaProduced: compare(range, prior, gpaProducedInRange),
    completedRuns: compare(range, prior, completedRunsInRange),
    exceptions: compare(range, prior, exceptionsInRange),
    priorPeriodLabel: prior?.label ?? null,
  };
}

export function formatKpiDelta(comparison: KpiComparison): string | null {
  if (comparison.previous == null) return null;
  const delta = comparison.current - comparison.previous;
  if (Math.abs(delta) < 0.005) return 'Same as prior period';
  const pct = comparison.previous !== 0
    ? (delta / comparison.previous) * 100
    : null;
  const sign = delta > 0 ? '+' : '';
  if (pct != null && Number.isFinite(pct)) {
    return `${sign}${pct.toFixed(0)}% vs prior (${sign}${formatDeltaNumber(delta)})`;
  }
  return `${sign}${formatDeltaNumber(delta)} vs prior`;
}

function formatDeltaNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
