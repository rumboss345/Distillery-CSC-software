import { format } from 'date-fns';
import type { ProductionCostMonthlyOverhead } from '../../types';
import { localCalendarDayKey } from '../date-input';
import type { ReportDateRange } from './period';

/** Monthly total labour (stored in master_distiller column for compatibility). */
export function monthlyLabourAmount(row: ProductionCostMonthlyOverhead): number {
  return row.master_distiller > 0 ? row.master_distiller : 0;
}

export function monthlyUtilitiesAmount(row: ProductionCostMonthlyOverhead): number {
  return (row.electric > 0 ? row.electric : 0)
    + (row.gas_propane > 0 ? row.gas_propane : 0);
}

export function monthlyOverheadAmount(row: ProductionCostMonthlyOverhead): number {
  return monthlyLabourAmount(row) + monthlyUtilitiesAmount(row);
}

/** Latest saved rate row with year_month on or before the given calendar month. */
export function effectiveMonthlyOverheadForMonth(
  yearMonth: string,
  entries: ProductionCostMonthlyOverhead[],
): ProductionCostMonthlyOverhead | null {
  const ym = yearMonth.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const sorted = [...entries]
    .map((row) => ({ ...row, year_month: row.year_month.trim().slice(0, 7) }))
    .filter((row) => /^\d{4}-\d{2}$/.test(row.year_month))
    .sort((a, b) => a.year_month.localeCompare(b.year_month));
  let match: ProductionCostMonthlyOverhead | null = null;
  for (const row of sorted) {
    if (row.year_month <= ym) match = row;
    else break;
  }
  return match;
}

export function daysInCalendarMonth(yearMonth: string): number {
  const ym = yearMonth.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function inclusiveDaySpan(fromDay: string, toDay: string): number {
  const [fy, fm, fd] = fromDay.split('-').map(Number);
  const [ty, tm, td] = toDay.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  if (end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

/** Inclusive calendar days of YYYY-MM that fall inside the report range. */
export function overlapDaysInMonth(
  yearMonth: string,
  range: Pick<ReportDateRange, 'from' | 'to'>,
): number {
  const ym = yearMonth.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return 0;
  const lastDay = daysInCalendarMonth(ym);
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(lastDay).padStart(2, '0')}`;
  const rangeFrom = range.from ?? '0000-01-01';
  const rangeTo = range.to ?? '9999-12-31';
  const overlapStart = monthStart > rangeFrom ? monthStart : rangeFrom;
  const overlapEnd = monthEnd < rangeTo ? monthEnd : rangeTo;
  return inclusiveDaySpan(overlapStart, overlapEnd);
}

function parseYearMonth(ym: string): { year: number; month: number } {
  const [year, month] = ym.slice(0, 7).split('-').map(Number);
  return { year, month };
}

function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Calendar months (YYYY-MM) that intersect an inclusive YYYY-MM-DD range. */
export function calendarMonthsInRange(
  range: Pick<ReportDateRange, 'from' | 'to'>,
): string[] {
  const rangeFrom = range.from ?? '0000-01-01';
  const rangeTo = range.to ?? '9999-12-31';
  if (rangeFrom > rangeTo) return [];

  const startYm = rangeFrom.slice(0, 7);
  const endYm = rangeTo.slice(0, 7);
  const months: string[] = [];
  let { year, month } = parseYearMonth(startYm);
  const end = parseYearMonth(endYm);

  for (;;) {
    months.push(formatYearMonth(year, month));
    if (year === end.year && month === end.month) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (months.length > 2400) break;
  }
  return months;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Sum monthly overhead for a report range: rates carry forward from each saved
 * "effective from" month until a newer row replaces them; partial months are
 * prorated by day count.
 */
function earliestEffectiveYearMonth(entries: ProductionCostMonthlyOverhead[]): string | null {
  let earliest: string | null = null;
  for (const row of entries) {
    const ym = row.year_month.trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    if (!earliest || ym < earliest) earliest = ym;
  }
  return earliest;
}

function resolveOverheadRangeBounds(
  range: ReportDateRange,
  entries: ProductionCostMonthlyOverhead[],
  now = new Date(),
): { from: string; to: string } {
  const today = localCalendarDayKey(now.toISOString()) ?? format(now, 'yyyy-MM-dd');
  const firstEntry = earliestEffectiveYearMonth(entries);

  if (!range.from && !range.to) {
    const from = firstEntry ? `${firstEntry}-01` : today;
    return { from, to: today };
  }

  return {
    from: range.from ?? '0000-01-01',
    to: range.to ?? '9999-12-31',
  };
}

function computeMonthlyAmountTotal(
  range: ReportDateRange,
  entries: ProductionCostMonthlyOverhead[],
  amountForRow: (row: ProductionCostMonthlyOverhead) => number,
  now = new Date(),
): number {
  if (entries.length === 0) return 0;

  const bounds = resolveOverheadRangeBounds(range, entries, now);
  let total = 0;
  for (const ym of calendarMonthsInRange(bounds)) {
    const effective = effectiveMonthlyOverheadForMonth(ym, entries);
    if (!effective) continue;
    const monthly = amountForRow(effective);
    if (monthly <= 0) continue;

    const overlapDays = overlapDaysInMonth(ym, bounds);
    if (overlapDays <= 0) continue;

    const dim = daysInCalendarMonth(ym);
    total += (monthly / dim) * overlapDays;
  }
  return roundMoney(total);
}

export function computeMonthlyLabourTotal(
  range: ReportDateRange,
  entries: ProductionCostMonthlyOverhead[],
  now = new Date(),
): number {
  return computeMonthlyAmountTotal(range, entries, monthlyLabourAmount, now);
}

export function computeMonthlyUtilitiesTotal(
  range: ReportDateRange,
  entries: ProductionCostMonthlyOverhead[],
  now = new Date(),
): number {
  return computeMonthlyAmountTotal(range, entries, monthlyUtilitiesAmount, now);
}

export function computeMonthlyOverheadTotal(
  range: ReportDateRange,
  entries: ProductionCostMonthlyOverhead[],
  now = new Date(),
): number {
  return computeMonthlyAmountTotal(range, entries, monthlyOverheadAmount, now);
}
