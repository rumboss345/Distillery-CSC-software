import { describe, expect, it } from 'vitest';
import { format, parseISO } from 'date-fns';
import {
  formatCalendarDay,
  formatDateDisplay,
  formatRecordedAt,
  isIsoDate,
  isIsoDateTime,
  isIsoMonth,
  joinDateTime,
  localCalendarDayKey,
  normalizeDateInput,
  normalizeDateTimeInput,
  normalizeMonthInput,
  splitDateTime,
} from './date-input';

describe('date-input', () => {
  it('validates ISO date strings', () => {
    expect(isIsoDate('2025-06-15')).toBe(true);
    expect(isIsoDate('2025-13-01')).toBe(false);
    expect(isIsoDate('06/15/2025')).toBe(false);
  });

  it('validates ISO month strings', () => {
    expect(isIsoMonth('2025-06')).toBe(true);
    expect(isIsoMonth('2025-13')).toBe(false);
  });

  it('validates ISO datetime strings', () => {
    expect(isIsoDateTime('2025-06-15T08:30')).toBe(true);
    expect(isIsoDateTime('2025-06-15')).toBe(false);
  });

  it('normalizes typed dates', () => {
    expect(normalizeDateInput('2025-06-15')).toBe('2025-06-15');
    expect(normalizeDateInput('6/15/2025')).toBe('2025-06-15');
    expect(normalizeDateInput('Jun 15, 2025')).toBe('2025-06-15');
    expect(normalizeDateInput('not a date')).toBeNull();
    expect(normalizeDateInput('')).toBe('');
  });

  it('normalizes typed months', () => {
    expect(normalizeMonthInput('2025-06')).toBe('2025-06');
    expect(normalizeMonthInput('June 2025')).toBe('2025-06');
    expect(normalizeMonthInput('bad')).toBeNull();
  });

  it('normalizes typed datetimes', () => {
    expect(normalizeDateTimeInput('2025-06-15T08:30')).toBe('2025-06-15T08:30');
    expect(normalizeDateTimeInput('6/15/2025 8:30 AM')).toBe('2025-06-15T08:30');
  });

  it('splits and joins datetime values', () => {
    expect(splitDateTime('2025-06-15T08:30')).toEqual({ date: '2025-06-15', time: '08:30' });
    expect(joinDateTime('2025-06-15', '08:30')).toBe('2025-06-15T08:30');
  });

  it('keeps a date-only value on the local calendar day', () => {
    expect(formatDateDisplay('2026-09-30')).toBe('Sep 30, 2026');
    expect(formatDateDisplay('2026-09-30')).toBe(format(new Date(2026, 8, 30), 'MMM d, yyyy'));
    expect(formatCalendarDay('2026-09-30')).toBe('Sep 30, 2026');
    expect(localCalendarDayKey('2026-09-30')).toBe('2026-09-30');
    expect(formatCalendarDay('2026-09-30T23:30')).toBe('Sep 30, 2026');
  });

  it('shows UTC timestamps on the local calendar day and clock', () => {
    const utcEvening = parseISO('2026-09-30T23:30:00Z');
    expect(formatCalendarDay('2026-09-30 23:30:00')).toBe(format(utcEvening, 'MMM d, yyyy'));
    expect(formatCalendarDay('2026-09-30T23:30:00.000Z')).toBe(format(utcEvening, 'MMM d, yyyy'));
    expect(formatRecordedAt('2026-09-30 23:30:00')).toBe(format(utcEvening, 'MMM d, yyyy HH:mm'));
    expect(localCalendarDayKey('2026-09-30T23:30:00.000Z')).toBe(format(utcEvening, 'yyyy-MM-dd'));
  });

  it('shows the date and time for logs and cuts', () => {
    expect(formatRecordedAt('2025-06-10T08:45')).toBe('Jun 10, 2025 08:45');
    expect(formatRecordedAt('2025-06-15T08:00:00')).toBe('Jun 15, 2025 08:00');
    expect(formatRecordedAt('')).toBe('—');
    expect(formatRecordedAt(null)).toBe('—');
  });
});
