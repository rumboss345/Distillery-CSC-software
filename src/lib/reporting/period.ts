import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';

export type ReportPeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom';

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
  const day = occurredAt.slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
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
