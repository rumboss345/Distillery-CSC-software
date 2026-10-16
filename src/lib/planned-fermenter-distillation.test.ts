import { describe, expect, it } from 'vitest';
import {
  choosePlannedFermenterRun,
  plannedFermenterDistillationMessage,
} from './planned-fermenter-distillation';

describe('choosePlannedFermenterRun', () => {
  const runs = [
    { id: 4, run_type: 'heavy_rum' },
    { id: 2, run_type: 'wash' },
  ];

  it('opens the planned run that matches the distillation they asked for', () => {
    expect(choosePlannedFermenterRun(runs, 'wash')?.id).toBe(2);
  });

  it('opens the planned run that exists when the other type was not scheduled', () => {
    expect(choosePlannedFermenterRun([{ id: 4, run_type: 'heavy_rum' }], 'wash')?.id).toBe(4);
  });

  it('returns nothing when the fermentation has no planned distillation', () => {
    expect(choosePlannedFermenterRun([], 'wash')).toBeUndefined();
  });
});

describe('plannedFermenterDistillationMessage', () => {
  it('names the planned run and says the date moves to the day it is distilled', () => {
    const message = plannedFermenterDistillationMessage({
      fermenterName: 'Fermentation 2',
      runLabel: 'Low Wine Run',
      batchNumber: 'D-2026-004',
      plannedDate: 'Jun 12, 2026',
    });
    expect(message).toContain('Fermentation 2 already has a planned Low Wine Run (D-2026-004) on Jun 12, 2026');
    expect(message).toContain('That planned run is open');
    expect(message).toContain('the date changes to the day you do it');
  });
});
