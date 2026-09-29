import { describe, expect, it } from 'vitest';
import { persistedStillage, runAsksForStillage, stillageSaveError, stillageSummary } from './stillage';

describe('stillage on completed low wine and heavy rum runs', () => {
  it('asks only for low wine and heavy rum runs', () => {
    expect(runAsksForStillage('wash')).toBe(true);
    expect(runAsksForStillage('heavy_rum')).toBe(true);
    expect(runAsksForStillage('low_wines')).toBe(false);
  });

  it('requires a volume and a store-or-discard choice when completing', () => {
    expect(stillageSaveError({
      status: 'complete',
      runType: 'wash',
      volumeGal: null,
      discarded: false,
      tankId: null,
    })).toMatch(/gallons of stillage/);
    expect(stillageSaveError({
      status: 'complete',
      runType: 'heavy_rum',
      volumeGal: 40,
      discarded: false,
      tankId: null,
    })).toMatch(/store the stillage/);
    expect(stillageSaveError({
      status: 'complete',
      runType: 'wash',
      volumeGal: 40,
      discarded: true,
      tankId: null,
    })).toBeNull();
    expect(stillageSaveError({
      status: 'complete',
      runType: 'wash',
      volumeGal: 40,
      discarded: false,
      tankId: 12,
    })).toBeNull();
    expect(stillageSaveError({
      status: 'running',
      runType: 'wash',
      volumeGal: null,
      discarded: false,
      tankId: null,
    })).toBeNull();
    expect(stillageSaveError({
      status: 'complete',
      runType: 'low_wines',
      volumeGal: null,
      discarded: false,
      tankId: null,
    })).toBeNull();
  });

  it('stores stillage in a tank or records it as discarded', () => {
    expect(persistedStillage({
      status: 'complete',
      runType: 'wash',
      volumeGal: 25,
      discarded: false,
      tankId: 4,
    })).toEqual({ volumeGal: 25, discarded: 0, tankId: 4 });
    expect(persistedStillage({
      status: 'complete',
      runType: 'heavy_rum',
      volumeGal: 25,
      discarded: true,
      tankId: 4,
    })).toEqual({ volumeGal: 25, discarded: 1, tankId: null });
    expect(stillageSummary({
      status: 'complete',
      runType: 'wash',
      volumeGal: 0,
      discarded: false,
    })).toBe('No stillage left');
    expect(stillageSummary({
      status: 'complete',
      runType: 'wash',
      volumeGal: 25,
      discarded: true,
    })).toBe('Stillage 25.0 gal discarded');
    expect(stillageSummary({
      status: 'complete',
      runType: 'heavy_rum',
      volumeGal: 25,
      discarded: false,
      tankName: 'Tails tank',
    })).toBe('Stillage 25.0 gal stored in Tails tank');
  });
});
