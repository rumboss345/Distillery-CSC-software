import { describe, expect, it } from 'vitest';
import {
  FERMENTATION_READY_MAX_BRIX,
  FERMENTER_LIQUID_GREEN_BELOW_BRIX,
  estimateAbvFromBrix,
  fermenterLiquidBrixPhase,
  isBrixReadyForDistillation,
} from './fermentation';

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
