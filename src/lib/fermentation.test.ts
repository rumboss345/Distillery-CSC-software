import { describe, expect, it } from 'vitest';
import {
  FERMENTATION_READY_MAX_BRIX,
  FERMENTER_LIQUID_GREEN_BELOW_BRIX,
  actualStartBrixError,
  expectedCompletionDateError,
  estimateAbvFromBrix,
  fermenterLiquidBrixPhase,
  isBrixReadyForDistillation,
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
});

describe('expected fermentation completion', () => {
  it('requires a date on or after the fermentation starts', () => {
    expect(expectedCompletionDateError('', '2026-03-01')).toMatch(/expected completion/i);
    expect(expectedCompletionDateError('2026-02-28', '2026-03-01')).toMatch(/on or after/i);
    expect(expectedCompletionDateError('2026-03-01', '2026-03-01')).toBeNull();
    expect(expectedCompletionDateError('2026-03-08', '2026-03-01')).toBeNull();
  });
});

describe('fermentation readiness', () => {
  it('requires brix below the ready threshold', () => {
    expect(isBrixReadyForDistillation(9.9)).toBe(true);
    expect(isBrixReadyForDistillation(10)).toBe(false);
    expect(isBrixReadyForDistillation(12)).toBe(false);
    expect(isBrixReadyForDistillation(null)).toBe(false);
  });

  it('uses 10 as the ready threshold', () => {
    expect(FERMENTATION_READY_MAX_BRIX).toBe(10);
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
