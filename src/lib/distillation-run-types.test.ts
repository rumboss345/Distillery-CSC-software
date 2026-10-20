import { describe, expect, it } from 'vitest';
import {
  isFermenterSourcedRun,
  isSpiritStyleRun,
  isTankSourcedRun,
  runTypeLabel,
  stillChargeSourcePhrase,
} from './distillation-run-types';

describe('distillation-run-types', () => {
  it('uses fermenters for low wine run and heavy rum runs', () => {
    expect(isFermenterSourcedRun('wash')).toBe(true);
    expect(isFermenterSourcedRun('heavy_rum')).toBe(true);
    expect(isFermenterSourcedRun('low_wines')).toBe(false);
  });

  it('charges a source tank for rum runs, vodka runs, and gin runs', () => {
    expect(isTankSourcedRun('low_wines')).toBe(true);
    expect(isTankSourcedRun('vodka')).toBe(true);
    expect(isTankSourcedRun('gin')).toBe(true);
    expect(isTankSourcedRun('wash')).toBe(false);
    expect(isTankSourcedRun('heavy_rum')).toBe(false);
  });

  it('names the old spirit run as a rum run and treats vodka the same way', () => {
    expect(runTypeLabel('low_wines')).toBe('Rum Run');
    expect(runTypeLabel('vodka')).toBe('Vodka Run');
    expect(isSpiritStyleRun('vodka')).toBe(true);
    expect(isFermenterSourcedRun('vodka')).toBe(false);
    expect(stillChargeSourcePhrase('low_wines')).toBe('Rum from');
    expect(stillChargeSourcePhrase('vodka')).toBe('Vodka from');
    expect(stillChargeSourcePhrase('gin')).toBe('Gin from');
  });
});
