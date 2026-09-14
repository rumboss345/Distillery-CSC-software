import {
  format,
  isValid,
  parse,
  parseISO,
  startOfMonth,
} from 'date-fns';

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

export function formatMonthDisplay(value: MonthValue): string {
  if (!isIsoMonth(value)) return value;
  return format(parseISO(`${value}-01`), 'MMMM yyyy');
}

export function formatDateTimeDisplay(value: DateTimeValue): string {
  if (!isIsoDateTime(value)) return value;
  return format(parseISO(value), 'MMM d, yyyy h:mm a');
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

  const loose = new Date(trimmed);
  if (isValid(loose) && !Number.isNaN(loose.getTime())) {
    return format(loose, "yyyy-MM-dd'T'HH:mm");
  }

  return null;
}

export function splitDateTime(value: DateTimeValue): { date: DateValue; time: string } {
  if (!isIsoDateTime(value)) {
    const today = format(new Date(), 'yyyy-MM-dd');
    return { date: today, time: '08:00' };
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
