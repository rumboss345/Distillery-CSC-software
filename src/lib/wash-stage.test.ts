import { describe, expect, it } from 'vitest';
import { washRecordKind, washRecordPath } from './wash-stage';

describe('washRecordKind', () => {
  it('keeps planned and washing batches on the wash page', () => {
    expect(washRecordKind('planned', { hasLogs: false, hasAssignments: false })).toBe('wash');
    expect(washRecordKind('mashing', { hasLogs: false, hasAssignments: false })).toBe('wash');
  });

  it('moves fermenting and complete batches to fermentation', () => {
    expect(washRecordKind('fermenting', { hasLogs: false, hasAssignments: true })).toBe('fermentation');
    expect(washRecordKind('complete', { hasLogs: true, hasAssignments: true })).toBe('fermentation');
  });

  it('keeps a discarded wash that never fermented on the wash page', () => {
    expect(washRecordKind('discarded', { hasLogs: false, hasAssignments: false })).toBe('wash');
    expect(washRecordPath('discarded')).toBe('/wash');
  });

  it('sends a discarded fermentation to the fermentation page', () => {
    expect(washRecordKind('discarded', { hasLogs: true, hasAssignments: false })).toBe('fermentation');
    expect(washRecordPath('fermenting')).toBe('/fermentation');
    expect(washRecordPath('complete')).toBe('/fermentation');
  });
});
