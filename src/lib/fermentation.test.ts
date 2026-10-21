import { describe, expect, it } from 'vitest';
import {
  FERMENTATION_READY_MAX_BRIX,
  FERMENTER_LIQUID_GREEN_BELOW_BRIX,
  actualStartBrixError,
  fermentersForStartBrixLog,
  brixFromFermentationReading,
  brixToSg,
  defaultExpectedCompletionDate,
  expectedCompletionDateError,
  expectedCompletionForTransfer,
  estimateAbvFromBrix,
  fermentationReadingError,
  fermenterLiquidBrixPhase,
  formatFermentationReading,
  isBrixReadyForDistillation,
  sgToBrix,
  washMoveNeedsActualStartBrix,
} from './fermentation';

describe('actual start Brix when a wash moves to fermenting', () => {
  it('asks while the wash is still planned or washing', () => {
    expect(washMoveNeedsActualStartBrix('planned', null)).toBe(true);
    expect(washMoveNeedsActualStartBrix('mashing', 16.8)).toBe(true);
  });

  it('asks again only when a fermenting wash has no measured start Brix', () => {
    expect(washMoveNeedsActualStartBrix('fermenting', null)).toBe(true);
    expect(washMoveNeedsActualStartBrix('fermenting', 16.8)).toBe(false);
  });

  it('requires a measured Brix above zero', () => {
    expect(actualStartBrixError(null)).toMatch(/actual start Brix/);
    expect(actualStartBrixError(0)).toMatch(/actual start Brix/);
    expect(actualStartBrixError(16.4)).toBeNull();
  });

  it('records Actual Start Brix as the first log on each new fermenter', () => {
    expect(fermentersForStartBrixLog([
      { equipmentId: 1, status: 'fermenting' },
      { equipmentId: 2, status: 'fermenting' },
      { equipmentId: 3, status: 'complete' },
      { equipmentId: 4, status: 'fermenting' },
    ], new Set([4]))).toEqual([1, 2]);
    expect(fermentersForStartBrixLog([
      { equipmentId: 1, status: 'discarded' },
    ], new Set())).toEqual([]);
  });
});

describe('expected fermentation completion', () => {
  it('defaults to four days after the wash is transferred', () => {
    expect(defaultExpectedCompletionDate('2026-03-01')).toBe('2026-03-05');
    expect(defaultExpectedCompletionDate('2026-01-30')).toBe('2026-02-03');
    expect(defaultExpectedCompletionDate('2026-12-30')).toBe('2027-01-03');
    expect(defaultExpectedCompletionDate('')).toBe('');
  });

  it('keeps a date that was already chosen', () => {
    expect(expectedCompletionForTransfer('2026-03-01', '2026-03-10')).toBe('2026-03-10');
    expect(expectedCompletionForTransfer('2026-03-01', '')).toBe('2026-03-05');
    expect(expectedCompletionForTransfer('2026-03-01', null)).toBe('2026-03-05');
  });

  it('requires a date on or after the fermentation starts', () => {
    expect(expectedCompletionDateError('', '2026-03-01')).toMatch(/expected completion/i);
    expect(expectedCompletionDateError('2026-02-28', '2026-03-01')).toMatch(/on or after/i);
    expect(expectedCompletionDateError('2026-03-01', '2026-03-01')).toBeNull();
    expect(expectedCompletionDateError('2026-03-08', '2026-03-01')).toBeNull();
  });
});

describe('fermentation readiness', () => {
  it('requires brix below the ready threshold', () => {
    expect(isBrixReadyForDistillation(4.9)).toBe(true);
    expect(isBrixReadyForDistillation(5)).toBe(false);
    expect(isBrixReadyForDistillation(9.9)).toBe(false);
    expect(isBrixReadyForDistillation(null)).toBe(false);
  });

  it('uses 5 as the ready threshold', () => {
    expect(FERMENTATION_READY_MAX_BRIX).toBe(5);
  });
});

describe('fermenter liquid Brix coloring', () => {
  it('uses 6° as the green liquid threshold', () => {
    expect(FERMENTER_LIQUID_GREEN_BELOW_BRIX).toBe(6);
  });

  it('marks high Brix as red phase and low as ready green', () => {
    expect(fermenterLiquidBrixPhase(12)).toBe('high');
    expect(fermenterLiquidBrixPhase(6)).toBe('high');
    expect(fermenterLiquidBrixPhase(5.9)).toBe('ready');
    expect(fermenterLiquidBrixPhase(null)).toBe('unknown');
  });
});

describe('estimateAbvFromBrix', () => {
  it('returns null for invalid input', () => {
    expect(estimateAbvFromBrix(0, 5)).toBeNull();
  });
});

describe('gravity or Brix fermentation readings', () => {
  it('stores a hydrometer reading as Brix', () => {
    expect(brixFromFermentationReading('gravity', '1.050')).toBe(sgToBrix(1.05));
    expect(brixFromFermentationReading('gravity', '1.050')).toBeGreaterThan(10);
  });

  it('keeps a finished gravity under 1.000', () => {
    expect(sgToBrix(0.995)).toBeLessThan(0);
    expect(brixFromFermentationReading('gravity', '0.995')).toBe(sgToBrix(0.995));
    expect(sgToBrix(1)).toBe(0);
  });

  it('rejects a Brix number typed on the gravity scale', () => {
    expect(brixFromFermentationReading('gravity', '12')).toBeNull();
    expect(brixFromFermentationReading('gravity', '1.')).toBeNull();
    expect(fermentationReadingError('gravity', '12')).toMatch(/specific gravity/);
    expect(fermentationReadingError('gravity', '1.050')).toBeNull();
    expect(brixFromFermentationReading('gravity', '1.0')).toBe(sgToBrix(1));
  });

  it('keeps a Brix reading and rejects values outside the ferment range', () => {
    expect(brixFromFermentationReading('brix', '12')).toBe(12);
    expect(brixFromFermentationReading('brix', '-1.2')).toBe(-1.2);
    expect(brixFromFermentationReading('brix', '41.2')).toBe(41.2);
    expect(brixFromFermentationReading('brix', '90')).toBeNull();
    expect(fermentationReadingError('brix', '')).toBeNull();
    const finished = brixFromFermentationReading('gravity', '0.980');
    expect(fermentationReadingError('brix', String(finished))).toBeNull();
  });

  it('still requires a start reading above zero after conversion', () => {
    expect(fermentationReadingError('gravity', '1.000', { requirePositive: true })).toMatch(/actual start Brix/);
    expect(fermentationReadingError('brix', '0', { requirePositive: true })).toMatch(/actual start Brix/);
    expect(fermentationReadingError('gravity', '1.050', { requirePositive: true })).toBeNull();
  });

  it('formats the stored Brix when the scale changes', () => {
    const brix = 16.4;
    const gravity = formatFermentationReading('gravity', brix);
    const back = brixFromFermentationReading('gravity', gravity);
    expect(gravity).toBe(brixToSg(brix).toFixed(3));
    expect(Math.abs((back ?? 0) - brix)).toBeLessThanOrEqual(0.1);
    expect(formatFermentationReading('brix', brix)).toBe('16.4');
  });
});
