import { describe, expect, it } from 'vitest';
import {
  isIsoDate,
  isIsoDateTime,
  isIsoMonth,
  joinDateTime,
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
});
