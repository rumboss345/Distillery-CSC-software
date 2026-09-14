import { describe, expect, it } from 'vitest';
import {
  FERMENTATION_READY_MAX_BRIX,
  estimateAbvFromBrix,
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

describe('estimateAbvFromBrix', () => {
  it('returns null for invalid input', () => {
    expect(estimateAbvFromBrix(0, 5)).toBeNull();
  });
});
