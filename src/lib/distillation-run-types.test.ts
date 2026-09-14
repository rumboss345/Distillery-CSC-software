import { describe, expect, it } from 'vitest';
import {
  isFermenterSourcedRun,
  isTankSourcedRun,
  runUsesDestHoldingTank,
} from './distillation-run-types';

describe('distillation-run-types', () => {
  it('uses fermenters for low wine rum and heavy rum runs', () => {
    expect(isFermenterSourcedRun('wash')).toBe(true);
    expect(isFermenterSourcedRun('heavy_rum')).toBe(true);
    expect(isFermenterSourcedRun('low_wines')).toBe(false);
  });

  it('uses holding tanks only for spirit runs', () => {
    expect(isTankSourcedRun('low_wines')).toBe(true);
    expect(isTankSourcedRun('wash')).toBe(false);
    expect(isTankSourcedRun('heavy_rum')).toBe(false);
  });

  it('tracks destination tanks for spirit and heavy rum runs', () => {
    expect(runUsesDestHoldingTank('low_wines')).toBe(true);
    expect(runUsesDestHoldingTank('heavy_rum')).toBe(true);
    expect(runUsesDestHoldingTank('wash')).toBe(false);
  });
});
