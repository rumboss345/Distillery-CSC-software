import { describe, expect, it } from 'vitest';
import {
  calendarPlanPath,
  isValidCalendarPlanDate,
  readCalendarPlanQuery,
  stripCalendarPlanQuery,
} from './calendar-planning';

describe('calendarPlanPath', () => {
  it('builds wash plan URL with date', () => {
    expect(calendarPlanPath('wash', '2026-09-18')).toBe('/wash?plan=1&date=2026-09-18');
  });

  it('builds transfer plan URL on distillation page', () => {
    expect(calendarPlanPath('transfer', '2026-09-18')).toBe(
      '/tank-transfer?plan=1&date=2026-09-18&transfer=1',
    );
  });
});

describe('readCalendarPlanQuery', () => {
  it('parses plan and transfer flags', () => {
    const params = new URLSearchParams('plan=1&date=2026-09-18&transfer=1');
    expect(readCalendarPlanQuery(params)).toEqual({
      date: '2026-09-18',
      transfer: true,
    });
  });

  it('returns null when plan flag is missing', () => {
    expect(readCalendarPlanQuery(new URLSearchParams('date=2026-09-18'))).toBeNull();
  });
});

describe('isValidCalendarPlanDate', () => {
  it('rejects invalid strings', () => {
    expect(isValidCalendarPlanDate('09-18-2026')).toBe(false);
    expect(isValidCalendarPlanDate('')).toBe(false);
  });
});

describe('stripCalendarPlanQuery', () => {
  it('removes plan-related params', () => {
    const next = stripCalendarPlanQuery(new URLSearchParams('plan=1&date=2026-09-18&recipe=3'));
    expect(next.get('plan')).toBeNull();
    expect(next.get('date')).toBeNull();
    expect(next.get('recipe')).toBe('3');
  });
});
