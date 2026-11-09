import { describe, expect, it } from 'vitest';
import { intakeDetailRows, intakeProofGallonsLabel } from './holding-tank-intake-detail';
import type { HoldingTankIntakeEntry } from '../types';

const cutEntry: HoldingTankIntakeEntry = {
  kind: 'cut',
  id: 1,
  occurred_at: '2026-04-02 14:30:00',
  volume_gal: 40,
  abv: 65,
  summary: 'Rum Run · Hearts from DR-2026-010',
  batchNumber: 'DR-2026-010',
  runType: 'low_wines',
  cutType: 'hearts',
  stillName: 'Vendome',
  mashBatch: 'WF-2026-004',
  recordedBy: 'Jamie',
  distillationRunId: 10,
};

describe('holding tank intake detail', () => {
  it('includes run, cut, and strength rows for a distillation cut', () => {
    const labels = intakeDetailRows(cutEntry).map((r) => r.label);
    expect(labels).toContain('Run batch');
    expect(labels).toContain('Cut');
    expect(labels).toContain('Wash batch');
    expect(labels).toContain('Recorded by');
    expect(labels).toContain('Proof gallons');
  });

  it('computes proof gallons from volume and ABV', () => {
    expect(intakeProofGallonsLabel(cutEntry)).toBe('52.0 proof gal');
  });
});
