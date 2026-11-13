import { describe, expect, it } from 'vitest';
import {
  computeMonthlyOverheadTotal,
  computeMonthlyProcessWaterOverheadTotal,
  effectiveMonthlyOverheadForMonth,
  overlapDaysInMonth,
} from './monthly-overhead';
import type { ProductionCostMonthlyOverhead } from '../../types';
import type { ReportDateRange } from './period';

const row = (
  year_month: string,
  master_distiller: number,
  electric = 0,
  gas_propane = 0,
  process_water = 0,
): ProductionCostMonthlyOverhead => ({
  year_month,
  master_distiller,
  electric,
  gas_propane,
  process_water,
});

describe('effectiveMonthlyOverheadForMonth', () => {
  const entries = [
    row('2026-01', 3000, 100, 50),
    row('2026-03', 3200, 120, 60),
  ];

  it('uses the latest row on or before the month', () => {
    expect(effectiveMonthlyOverheadForMonth('2026-01', entries)?.master_distiller).toBe(3000);
    expect(effectiveMonthlyOverheadForMonth('2026-02', entries)?.master_distiller).toBe(3000);
    expect(effectiveMonthlyOverheadForMonth('2026-03', entries)?.master_distiller).toBe(3200);
    expect(effectiveMonthlyOverheadForMonth('2026-11', entries)?.master_distiller).toBe(3200);
  });

  it('returns null before the first effective month', () => {
    expect(effectiveMonthlyOverheadForMonth('2025-12', entries)).toBeNull();
  });
});

describe('overlapDaysInMonth', () => {
  it('counts partial months inside the range', () => {
    const range = { from: '2026-11-15', to: '2026-12-31' };
    expect(overlapDaysInMonth('2026-11', range)).toBe(16);
    expect(overlapDaysInMonth('2026-12', range)).toBe(31);
    expect(overlapDaysInMonth('2026-10', range)).toBe(0);
  });
});

describe('computeMonthlyOverheadTotal', () => {
  const entries = [row('2026-01', 3100, 0, 0)];

  it('carries forward the same monthly amount for later months', () => {
    const range: ReportDateRange = {
      preset: 'custom',
      from: '2026-02-01',
      to: '2026-02-28',
      label: 'Feb',
    };
    expect(computeMonthlyOverheadTotal(range, entries)).toBe(3100);
  });

  it('prorates when the range starts mid-month', () => {
    const range: ReportDateRange = {
      preset: 'custom',
      from: '2026-01-16',
      to: '2026-01-31',
      label: 'Half Jan',
    };
    const janDays = 31;
    const overlap = 16;
    const expected = Math.round((3100 / janDays) * overlap * 100) / 100;
    expect(computeMonthlyOverheadTotal(range, entries)).toBe(expected);
  });

  it('prorates across two months in one range', () => {
    const range: ReportDateRange = {
      preset: 'custom',
      from: '2026-01-16',
      to: '2026-02-15',
      label: 'Span',
    };
    const janPart = (3100 / 31) * 16;
    const febPart = (3100 / 28) * 15;
    const expected = Math.round((janPart + febPart) * 100) / 100;
    expect(computeMonthlyOverheadTotal(range, entries)).toBe(expected);
  });

  it('applies a mid-range rate change only from that month onward', () => {
    const withChange = [
      row('2026-01', 3000),
      row('2026-02', 4000),
    ];
    const range: ReportDateRange = {
      preset: 'custom',
      from: '2026-01-01',
      to: '2026-02-28',
      label: 'Jan–Feb',
    };
    expect(computeMonthlyOverheadTotal(range, withChange)).toBe(7000);
  });

  it('includes facility process water in the monthly overhead total', () => {
    const entries = [row('2026-01', 0, 0, 0, 450)];
    const range: ReportDateRange = {
      preset: 'custom',
      from: '2026-03-01',
      to: '2026-03-31',
      label: 'Mar',
    };
    expect(computeMonthlyProcessWaterOverheadTotal(range, entries)).toBe(450);
    expect(computeMonthlyOverheadTotal(range, entries)).toBe(450);
  });
});
