import { describe, expect, it } from 'vitest';
import {
  chartAxis,
  compareProductivityYears,
  defaultProductivityYear,
  productivityYearOptions,
  type MonthlyProduction,
} from './productivity';

const rows: MonthlyProduction[] = [
  { month: '2025-06', heartsGal: 25.1, pureAlcoholGal: 17.068, bottles: 0, runs: 1 },
  { month: '2025-06', heartsGal: 10, pureAlcoholGal: 4, bottles: 0, runs: 1 },
  { month: '2026-06', heartsGal: 40, pureAlcoholGal: 20, bottles: 120, runs: 2 },
  { month: '2025-05', heartsGal: 0, pureAlcoholGal: 0, bottles: 480, runs: 0 },
  { month: '2024-01', heartsGal: 5, pureAlcoholGal: 3, bottles: 0, runs: 1 },
];

describe('productivity comparison', () => {
  it('lines up each month with the same month a year earlier', () => {
    const comparison = compareProductivityYears(rows, 2026, 'heartsGal');
    expect(comparison.months).toHaveLength(12);
    expect(comparison.months[4]).toEqual({ label: 'May', current: 0, previous: 0 });
    expect(comparison.months[5]).toEqual({ label: 'Jun', current: 40, previous: 35.1 });
    expect(comparison.currentTotal).toBe(40);
    expect(comparison.previousTotal).toBe(35.1);
    expect(comparison.summary).toBe(
      '40.0 gal of hearts in 2026, compared with 35.1 gal of hearts in 2025 (4.9 gal more, 14%).',
    );
  });

  it('counts bottles on their own dates', () => {
    const comparison = compareProductivityYears(rows, 2026, 'bottles');
    expect(comparison.months[4]).toEqual({ label: 'May', current: 0, previous: 480 });
    expect(comparison.months[5].current).toBe(120);
    expect(comparison.summary).toContain('120 bottles in 2026');
    expect(comparison.summary).toContain('480 bottles in 2025');
  });

  it('uses a singular count and keeps a near-total drop under 100 percent', () => {
    const sparse: MonthlyProduction[] = [
      { month: '2026-10', heartsGal: 0, pureAlcoholGal: 0, bottles: 1, runs: 0 },
      { month: '2025-05', heartsGal: 0, pureAlcoholGal: 0, bottles: 480, runs: 1 },
    ];
    expect(compareProductivityYears(sparse, 2026, 'bottles').summary).toBe(
      '1 bottle in 2026, compared with 480 bottles in 2025 (479 bottles less, 99.8%).',
    );
    expect(compareProductivityYears(sparse, 2026, 'runs').summary).toBe(
      'No completed runs recorded in 2026. 2025 had 1 completed run.',
    );
  });

  it('says when a year has no recorded production', () => {
    const comparison = compareProductivityYears(rows, 2024, 'bottles');
    expect(comparison.summary).toBe('No bottles recorded in 2024 or 2023.');
  });

  it('offers every year from the earliest record through today', () => {
    expect(productivityYearOptions(rows, 2026)).toEqual([2026, 2025, 2024]);
    expect(defaultProductivityYear(rows, 2026)).toBe(2026);
    expect(defaultProductivityYear(
      rows.filter((row) => row.month.startsWith('2025') || row.month.startsWith('2024')),
      2026,
    )).toBe(2025);
  });

  it('picks axis ticks above the tallest bar', () => {
    expect(chartAxis(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(chartAxis(25.1).max).toBeGreaterThanOrEqual(25.1);
    expect(chartAxis(480).ticks[0]).toBe(0);
    expect(chartAxis(480).max).toBeGreaterThanOrEqual(480);
  });
});
