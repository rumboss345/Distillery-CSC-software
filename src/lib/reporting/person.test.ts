import { describe, expect, it } from 'vitest';
import {
  employeeFromAccount,
  emptyForEmployee,
  filterRowsByPerson,
  isUnassignedPerson,
  mergeReportEmployees,
  reportPersonMatches,
  reportPeriodLabel,
  type ReportEmployee,
} from './person';

const ada: ReportEmployee = employeeFromAccount({
  id: 4,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
});

describe('report person filter', () => {
  it('keeps every row when no employee is selected', () => {
    expect(reportPersonMatches('Ada Lovelace', null)).toBe(true);
    expect(reportPersonMatches('—', null)).toBe(true);
    expect(reportPersonMatches('', null)).toBe(true);
    expect(reportPersonMatches(null, null)).toBe(true);
  });

  it('matches the account name, email, and display label', () => {
    expect(reportPersonMatches('Ada Lovelace', ada)).toBe(true);
    expect(reportPersonMatches('ada lovelace', ada)).toBe(true);
    expect(reportPersonMatches('ada@example.com', ada)).toBe(true);
    expect(reportPersonMatches('Someone Else', ada)).toBe(false);
  });

  it('matches a recorded account id when the stored name differs', () => {
    expect(reportPersonMatches('Old Name', ada, 4)).toBe(true);
    expect(reportPersonMatches('Old Name', ada, 9)).toBe(false);
  });

  it('does not treat a blank or dash as a specific employee', () => {
    expect(isUnassignedPerson('—')).toBe(true);
    expect(isUnassignedPerson('— (system)')).toBe(true);
    expect(isUnassignedPerson('  ')).toBe(true);
    expect(reportPersonMatches('—', ada)).toBe(false);
    expect(reportPersonMatches('', ada)).toBe(false);
    expect(reportPersonMatches(null, ada)).toBe(false);
    expect(reportPersonMatches('— (system)', ada)).toBe(false);
  });

  it('adds recorded names that are not current accounts', () => {
    const options = mergeReportEmployees([ada], ['Ada Lovelace', '—', 'Sam Chen', 'sam chen']);
    expect(options.map((option) => option.label)).toEqual(['Ada Lovelace', 'Sam Chen']);
    expect(options[1].id).toBeNull();
    expect(reportPersonMatches('Sam Chen', options[1])).toBe(true);
    expect(reportPersonMatches('Ada Lovelace', options[1])).toBe(false);
  });

  it('filters rows and labels the period', () => {
    const rows = [
      { operator: 'Ada Lovelace' },
      { operator: '—' },
      { operator: 'Sam Chen' },
    ];
    expect(filterRowsByPerson(rows, (row) => row.operator, ada)).toEqual([
      { operator: 'Ada Lovelace' },
    ]);
    expect(filterRowsByPerson(rows, (row) => row.operator, null)).toEqual(rows);
    expect(reportPeriodLabel('October 2026', ada)).toBe('October 2026 · Ada Lovelace');
    expect(reportPeriodLabel('October 2026', null)).toBe('October 2026');
    expect(emptyForEmployee('No wash batches in this period.', ada)).toBe(
      'No wash batches for Ada Lovelace in this period.',
    );
    expect(emptyForEmployee('No exceptions detected for this period.', ada)).toBe(
      'No exceptions detected for Ada Lovelace in this period.',
    );
  });
});
