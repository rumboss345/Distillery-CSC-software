import {
  format,
  isValid,
  parse,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { localIsoDate } from './planned-event-date';

/** ISO date string `YYYY-MM-DD` or empty. */
export type DateValue = string;

/** ISO datetime string `YYYY-MM-DDTHH:mm` or empty. */
export type DateTimeValue = string;

/** ISO month string `YYYY-MM` or empty. */
export type MonthValue = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return isValid(parseISO(value));
}

export function isIsoMonth(value: string): boolean {
  if (!ISO_MONTH.test(value)) return false;
  return isValid(parseISO(`${value}-01`));
}

export function isIsoDateTime(value: string): boolean {
  if (!ISO_DATETIME.test(value)) return false;
  return isValid(parseISO(value));
}

export function formatDateDisplay(value: DateValue): string {
  if (!isIsoDate(value)) return value;
  return format(parseISO(value), 'MMM d, yyyy');
}

/**
 * SQLite `datetime('now')` is UTC and looks like `YYYY-MM-DD HH:mm:ss`
 * (space, no zone). A `T` without a zone is a local wall-clock time the
 * user entered. A date-only `YYYY-MM-DD` is a calendar day, not UTC midnight.
 */
const SQLITE_UTC_DATETIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/;

export function parseStoredDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sqlite = trimmed.match(SQLITE_UTC_DATETIME);
  if (sqlite) {
    const zone = sqlite[3] ?? 'Z';
    const parsed = parseISO(`${sqlite[1]}T${sqlite[2]}${zone}`);
    return isValid(parsed) ? parsed : null;
  }
  const parsed = parseISO(trimmed);
  return isValid(parsed) ? parsed : null;
}

/** Local calendar day (`YYYY-MM-DD`) for a stored date or timestamp. */
export function localCalendarDayKey(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  if (isIsoDate(trimmed)) return trimmed;
  const parsed = parseStoredDate(trimmed);
  if (!parsed) return '';
  return format(parsed, 'yyyy-MM-dd');
}

/**
 * Calendar day for a stored date (`YYYY-MM-DD`) or datetime.
 * A date-only value stays on that calendar day. Timestamps show the local day.
 */
export function formatCalendarDay(value: string | null | undefined): string {
  const day = localCalendarDayKey(value);
  if (!day) return value?.trim() ? value.trim() : '';
  return formatDateDisplay(day);
}

export function compareStoredDatesDesc(a: string, b: string): number {
  const aTime = parseStoredDate(a)?.getTime() ?? 0;
  const bTime = parseStoredDate(b)?.getTime() ?? 0;
  return bTime - aTime;
}

export function formatMonthDisplay(value: MonthValue): string {
  if (!isIsoMonth(value)) return value;
  return format(parseISO(`${value}-01`), 'MMMM yyyy');
}

export function formatDateTimeDisplay(value: DateTimeValue): string {
  if (!isIsoDateTime(value)) return value;
  return format(parseISO(value), 'MMM d, yyyy h:mm a');
}

/** Date and time in the browser's local timezone. Date-only values stay on that day. */
export function formatRecordedAt(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '—';
  if (isIsoDate(trimmed)) return formatDateDisplay(trimmed);
  const parsed = parseStoredDate(trimmed);
  if (!parsed) return trimmed;
  return format(parsed, 'MMM d, yyyy HH:mm');
}

/** Normalize typed date input to ISO date or return null if invalid. */
export function normalizeDateInput(input: string): DateValue | null {
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (isIsoDate(trimmed)) return trimmed;

  const patterns = ['M/d/yyyy', 'MM/dd/yyyy', 'yyyy/M/d', 'MMM d, yyyy', 'MMMM d, yyyy'];
  for (const pattern of patterns) {
    const parsed = parse(trimmed, pattern, new Date());
    if (isValid(parsed)) return format(parsed, 'yyyy-MM-dd');
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const day = localCalendarDayKey(trimmed);
    return isIsoDate(day) ? day : null;
  }

  const loose = new Date(trimmed);
  if (isValid(loose) && !Number.isNaN(loose.getTime())) {
    return format(loose, 'yyyy-MM-dd');
  }

  return null;
}

export function normalizeMonthInput(input: string): MonthValue | null {
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (isIsoMonth(trimmed)) return trimmed;

  const patterns = ['MMMM yyyy', 'MMM yyyy', 'M/yyyy', 'MM/yyyy', 'yyyy-MM'];
  for (const pattern of patterns) {
    const parsed = parse(trimmed, pattern, new Date());
    if (isValid(parsed)) return format(startOfMonth(parsed), 'yyyy-MM');
  }

  const loose = new Date(trimmed);
  if (isValid(loose) && !Number.isNaN(loose.getTime())) {
    return format(startOfMonth(loose), 'yyyy-MM');
  }

  return null;
}

export function normalizeDateTimeInput(input: string): DateTimeValue | null {
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (isIsoDateTime(trimmed)) return trimmed;

  const patterns = [
    "yyyy-MM-dd'T'HH:mm",
    'M/d/yyyy h:mm a',
    'M/d/yyyy HH:mm',
    'MMM d, yyyy h:mm a',
  ];
  for (const pattern of patterns) {
    const parsed = parse(trimmed, pattern, new Date());
    if (isValid(parsed)) return format(parsed, "yyyy-MM-dd'T'HH:mm");
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parsed = parseStoredDate(trimmed);
    if (!parsed) return null;
    return format(parsed, "yyyy-MM-dd'T'HH:mm");
  }

  const loose = new Date(trimmed);
  if (isValid(loose) && !Number.isNaN(loose.getTime())) {
    return format(loose, "yyyy-MM-dd'T'HH:mm");
  }

  return null;
}

export function splitDateTime(value: DateTimeValue): { date: DateValue; time: string } {
  if (!isIsoDateTime(value)) {
    return { date: localIsoDate(), time: '08:00' };
  }
  const [date, time] = value.split('T');
  return { date, time };
}

export function joinDateTime(date: DateValue, time: string): DateTimeValue {
  if (!date) return '';
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
  return `${date}T${normalizedTime}`;
}

export function monthStartDate(value: MonthValue): Date {
  if (isIsoMonth(value)) return parseISO(`${value}-01`);
  return startOfMonth(new Date());
}
