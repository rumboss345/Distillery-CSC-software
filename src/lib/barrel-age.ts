import { intervalToDuration, parseISO } from 'date-fns';
import { isIsoDate } from './date-input';

export type BarrelAgeParts = {
  years: number;
  months: number;
  days: number;
};

function agePart(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Calendar years, months, and days since fill (fill day = 0 days). */
export function barrelAgeParts(
  fillDate: string,
  today: Date = new Date(),
): BarrelAgeParts | null {
  if (!isIsoDate(fillDate)) return null;
  const start = parseISO(fillDate);
  const end = today;
  if (start > end) return { years: 0, months: 0, days: 0 };
  const duration = intervalToDuration({ start, end });
  return {
    years: duration.years ?? 0,
    months: duration.months ?? 0,
    days: duration.days ?? 0,
  };
}

/** Human-readable age, e.g. "2 years, 3 months, 15 days" (omits zero higher units). */
export function formatBarrelAge(fillDate: string, today?: Date): string | null {
  const parts = barrelAgeParts(fillDate, today);
  if (!parts) return null;
  const bits: string[] = [];
  if (parts.years > 0) bits.push(agePart(parts.years, 'year', 'years'));
  if (parts.months > 0) bits.push(agePart(parts.months, 'month', 'months'));
  if (parts.days > 0 || bits.length === 0) bits.push(agePart(parts.days, 'day', 'days'));
  return bits.join(', ');
}