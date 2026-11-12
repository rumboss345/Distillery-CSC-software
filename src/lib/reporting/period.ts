import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import { localCalendarDayKey } from '../date-input';

export type ReportPeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'all' | 'custom';

export interface ReportDateRange {
  preset: ReportPeriodPreset;
  from: string | null;
  to: string | null;
  label: string;
}

function toIsoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function resolveReportPeriod(
  preset: ReportPeriodPreset,
  customFrom?: string,
  customTo?: string,
  now = new Date(),
): ReportDateRange {
  const today = startOfDay(now);

  switch (preset) {
    case 'today': {
      const d = toIsoDate(today);
      return { preset, from: d, to: d, label: 'Today' };
    }
    case 'yesterday': {
      const y = subDays(today, 1);
      const d = toIsoDate(y);
      return { preset, from: d, to: d, label: 'Yesterday' };
    }
    case 'week': {
      const start = startOfWeek(today, { weekStartsOn: 0 });
      const end = endOfWeek(today, { weekStartsOn: 0 });
      return {
        preset,
        from: toIsoDate(start),
        to: toIsoDate(end),
        label: 'This week',
      };
    }
    case 'month': {
      return {
        preset,
        from: toIsoDate(startOfMonth(today)),
        to: toIsoDate(endOfMonth(today)),
        label: format(today, 'MMMM yyyy'),
      };
    }
    case 'lastMonth': {
      const previous = subMonths(today, 1);
      return {
        preset,
        from: toIsoDate(startOfMonth(previous)),
        to: toIsoDate(endOfMonth(previous)),
        label: format(previous, 'MMMM yyyy'),
      };
    }
    case 'custom': {
      const from = customFrom?.slice(0, 10) || null;
      const to = customTo?.slice(0, 10) || null;
      const label = from && to ? `${from} – ${to}` : from || to || 'Custom range';
      return { preset, from, to, label };
    }
    case 'all':
    default:
      return { preset: 'all', from: null, to: null, label: 'All time' };
  }
}

/** Compare event timestamp (ISO date or datetime) to inclusive YYYY-MM-DD range. */
export function eventInReportRange(
  occurredAt: string | null | undefined,
  range: Pick<ReportDateRange, 'from' | 'to'>,
): boolean {
  if (!range.from && !range.to) return true;
  if (!occurredAt) return false;
  const day = localCalendarDayKey(occurredAt);
  if (!day) return false;
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

/** True when any day of YYYY-MM falls inside an inclusive report date range. */
export function calendarMonthInReportRange(
  yearMonth: string,
  range: Pick<ReportDateRange, 'from' | 'to'>,
): boolean {
  if (!range.from && !range.to) return true;
  const ym = yearMonth.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return false;
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(lastDay).padStart(2, '0')}`;
  const rangeFrom = range.from ?? '0000-01-01';
  const rangeTo = range.to ?? '9999-12-31';
  return monthStart <= rangeTo && monthEnd >= rangeFrom;
}

export function monthToRange(month: string): ReportDateRange {
  if (!month || month.length < 7) {
    return resolveReportPeriod('all');
  }
  const start = parseMonthStart(month);
  const end = endOfMonth(start);
  return {
    preset: 'custom',
    from: toIsoDate(start),
    to: toIsoDate(end),
    label: format(start, 'MMMM yyyy'),
  };
}

function parseMonthStart(month: string): Date {
  return startOfDay(new Date(`${month.slice(0, 7)}-01T12:00:00`));
}

export function endOfRangeIsoDay(to: string): string {
  return format(endOfDay(new Date(`${to}T12:00:00`)), "yyyy-MM-dd'T'HH:mm:ss");
}

/** YYYY-MM when from/to are the first and last calendar day of the same month; otherwise null. */
export function fullCalendarMonthKey(
  range: Pick<ReportDateRange, 'from' | 'to'>,
): string | null {
  if (!range.from || !range.to) return null;
  if (range.from.slice(0, 7) !== range.to.slice(0, 7)) return null;
  const ym = range.from.slice(0, 7);
  const [year, month] = ym.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const lastDay = new Date(year, month, 0).getDate();
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(lastDay).padStart(2, '0')}`;
  if (range.from !== monthStart || range.to !== monthEnd) return null;
  return ym;
}
