import { addMonths, differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns';
import { localCalendarDayKey, parseStoredDate } from '../date-input';
import { calendarMonthInReportRange, type ReportDateRange } from '../reporting/period';
import type { MonthlyProduction } from '../reporting/productivity';
import type { BottlingReportRow } from '../reporting/bottling-rows';
import { roundAlcohol, roundVolume } from '../reporting/alcohol-units';

export interface MonthPoint {
  /** YYYY-MM */
  month: string;
  label: string;
}

/** The last `count` months ending with the month of `today`, oldest first. */
export function recentMonths(today: string, count: number): MonthPoint[] {
  const end = parseISO(`${today.slice(0, 7)}-01`);
  return Array.from({ length: count }, (_, index) => {
    const day = addMonths(end, index - (count - 1));
    return { month: format(day, 'yyyy-MM'), label: format(day, 'MMM') };
  });
}

export interface ProductionVolumePoint extends MonthPoint {
  heartsGal: number;
  pureAlcoholGal: number;
  bottles: number;
}

/**
 * Chart columns for the selected dashboard period.
 * Short ranges use days; longer ranges use months (up to six) that overlap the period.
 */
export function chartTimeBuckets(range: ReportDateRange, today: string, maxMonths = 6): MonthPoint[] {
  const { from, to } = range;
  if (!from && !to) return recentMonths(today, maxMonths);
  if (from && to && from === to) {
    return [{ month: from, label: format(parseISO(from), 'MMM d') }];
  }
  if (from && to) {
    const start = parseISO(from);
    const end = parseISO(to);
    const daySpan = differenceInCalendarDays(end, start) + 1;
    if (daySpan <= 31) {
      return eachDayOfInterval({ start, end }).map((day) => ({
        month: format(day, 'yyyy-MM-dd'),
        label: format(day, 'd MMM'),
      }));
    }
  }
  const anchor = to ?? today;
  const months = recentMonths(anchor, maxMonths).filter((point) => calendarMonthInReportRange(point.month, range));
  if (months.length > 0) return months;
  if (from) {
    const ym = from.slice(0, 7);
    return [{ month: ym, label: format(parseISO(`${ym}-01`), 'MMM yyyy') }];
  }
  return recentMonths(today, 1);
}

function bucketKeyForRun(runDate: string, daily: boolean): string {
  return daily ? localCalendarDayKey(runDate) : runDate.slice(0, 7);
}

export interface HeartsByRunDate {
  run_date: string;
  hearts_gal: number;
}

/** Hearts (and monthly bottle totals) for the dashboard period. */
export function productionVolumeSeriesForRange(
  monthly: MonthlyProduction[],
  range: ReportDateRange,
  today: string,
  runs: HeartsByRunDate[],
): ProductionVolumePoint[] {
  const buckets = chartTimeBuckets(range, today);
  const daily = buckets[0]?.month.length === 10;
  const byMonth = new Map(monthly.map((row) => [row.month, row]));
  return buckets.map((point) => {
    if (daily) {
      const heartsGal = runs
        .filter((run) => bucketKeyForRun(run.run_date, true) === point.month)
        .reduce((sum, run) => sum + run.hearts_gal, 0);
      return {
        ...point,
        heartsGal: roundVolume(heartsGal),
        pureAlcoholGal: 0,
        bottles: 0,
      };
    }
    const ym = point.month.length === 7 ? point.month : point.month.slice(0, 7);
    const row = byMonth.get(ym);
    return {
      ...point,
      heartsGal: roundVolume(row?.heartsGal ?? 0),
      pureAlcoholGal: roundAlcohol(row?.pureAlcoholGal ?? 0),
      bottles: row?.bottles ?? 0,
    };
  });
}

/** Distillation yield for the dashboard period (same buckets as production). */
export function yieldSeriesForRange(
  runs: YieldRunInput[],
  range: ReportDateRange,
  today: string,
): YieldPoint[] {
  const buckets = chartTimeBuckets(range, today);
  const daily = buckets[0]?.month.length === 10;
  const totals = new Map(buckets.map((point) => [point.month, { expected: 0, actual: 0 }]));
  for (const run of runs) {
    if (run.charged_laa_gal == null || run.collected_laa_gal == null) continue;
    const key = bucketKeyForRun(run.run_date, daily);
    const bucket = totals.get(key);
    if (!bucket) continue;
    bucket.expected += run.charged_laa_gal;
    bucket.actual += run.collected_laa_gal;
  }
  return buckets.map((point) => {
    const bucket = totals.get(point.month) ?? { expected: 0, actual: 0 };
    return {
      ...point,
      expectedLaaGal: roundAlcohol(bucket.expected),
      actualLaaGal: roundAlcohol(bucket.actual),
      yieldPct: bucket.expected > 0 ? Math.round((bucket.actual / bucket.expected) * 1000) / 10 : null,
    };
  });
}

/** Hearts collected and bottles filled per month. Months with no records are zero. */
export function productionVolumeSeries(
  monthly: MonthlyProduction[],
  today: string,
  count = 6,
): ProductionVolumePoint[] {
  const byMonth = new Map(monthly.map((row) => [row.month, row]));
  return recentMonths(today, count).map((point) => {
    const row = byMonth.get(point.month);
    return {
      ...point,
      heartsGal: roundVolume(row?.heartsGal ?? 0),
      pureAlcoholGal: roundAlcohol(row?.pureAlcoholGal ?? 0),
      bottles: row?.bottles ?? 0,
    };
  });
}

export interface BottlingProductPoint {
  product: string;
  bottles: number;
  bottledGal: number;
  sizes: { sizeMl: number; count: number }[];
}

/** Bottles filled per product in the period, largest first. */
export function bottlingByProduct(rows: BottlingReportRow[]): BottlingProductPoint[] {
  const byProduct = new Map<string, BottlingProductPoint & { sizeMap: Map<number, number> }>();
  for (const row of rows) {
    const product = row.product_name?.trim() || 'Unnamed product';
    const entry = byProduct.get(product) ?? {
      product,
      bottles: 0,
      bottledGal: 0,
      sizes: [],
      sizeMap: new Map<number, number>(),
    };
    entry.bottles += row.bottle_count;
    entry.bottledGal += row.bottled_gal;
    for (const size of row.bottle_sizes) {
      entry.sizeMap.set(size.sizeMl, (entry.sizeMap.get(size.sizeMl) ?? 0) + size.count);
    }
    byProduct.set(product, entry);
  }
  return [...byProduct.values()]
    .map(({ sizeMap, ...entry }) => ({
      ...entry,
      bottledGal: roundVolume(entry.bottledGal),
      sizes: [...sizeMap.entries()].sort((a, b) => b[0] - a[0]).map(([sizeMl, count]) => ({ sizeMl, count })),
    }))
    .filter((entry) => entry.bottles > 0)
    .sort((a, b) => b.bottles - a.bottles || a.product.localeCompare(b.product));
}

export interface YieldRunInput {
  run_date: string;
  charged_laa_gal: number | null;
  collected_laa_gal: number | null;
}

export interface YieldPoint extends MonthPoint {
  /** Pure alcohol charged: what the still could give back. */
  expectedLaaGal: number;
  /** Pure alcohol collected in all cuts. */
  actualLaaGal: number;
  /** actual ÷ expected, as a percent. Null when nothing was charged. */
  yieldPct: number | null;
}

/** Distillation: pure alcohol charged vs collected per month, for runs that recorded both. */
export function yieldSeries(runs: YieldRunInput[], today: string, count = 6): YieldPoint[] {
  const months = recentMonths(today, count);
  const totals = new Map(months.map((point) => [point.month, { expected: 0, actual: 0 }]));
  for (const run of runs) {
    if (run.charged_laa_gal == null || run.collected_laa_gal == null) continue;
    const bucket = totals.get(run.run_date.slice(0, 7));
    if (!bucket) continue;
    bucket.expected += run.charged_laa_gal;
    bucket.actual += run.collected_laa_gal;
  }
  return months.map((point) => {
    const bucket = totals.get(point.month) ?? { expected: 0, actual: 0 };
    return {
      ...point,
      expectedLaaGal: roundAlcohol(bucket.expected),
      actualLaaGal: roundAlcohol(bucket.actual),
      yieldPct: bucket.expected > 0 ? Math.round((bucket.actual / bucket.expected) * 1000) / 10 : null,
    };
  });
}

export interface InventoryLogInput {
  delta: number;
  created_at: string;
}

export interface InventoryTrendPoint {
  /** YYYY-MM-DD */
  date: string;
  quantity: number;
}

/**
 * Daily on-hand balance for one item over the last `days` days, ending today.
 * Worked backwards from today's count using the usage log, so it never invents a reading.
 */
export function inventoryTrend(
  logs: InventoryLogInput[],
  currentQuantity: number,
  today: string,
  days = 30,
): InventoryTrendPoint[] {
  const end = parseISO(today);
  const dayKeys = Array.from({ length: days }, (_, index) => format(addDaysSafe(end, index - (days - 1)), 'yyyy-MM-dd'));
  const deltaByDay = new Map<string, number>();
  for (const log of logs) {
    const parsed = parseStoredDate(log.created_at);
    if (!parsed) continue;
    const key = format(parsed, 'yyyy-MM-dd');
    deltaByDay.set(key, (deltaByDay.get(key) ?? 0) + log.delta);
  }
  const points: InventoryTrendPoint[] = [];
  let balance = currentQuantity;
  for (let index = dayKeys.length - 1; index >= 0; index -= 1) {
    const key = dayKeys[index];
    points.unshift({ date: key, quantity: Math.round(balance * 100) / 100 });
    balance -= deltaByDay.get(key) ?? 0;
  }
  return points;
}

function addDaysSafe(date: Date, amount: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}
