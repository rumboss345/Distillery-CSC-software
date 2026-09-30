import { describe, expect, it } from 'vitest';
import { mashStatusFromFermentations, washRecordKind, washRecordPath } from './wash-stage';

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

describe('mashStatusFromFermentations', () => {
  it('keeps the wash fermenting while any fermenter is still fermenting', () => {
    expect(mashStatusFromFermentations('fermenting', ['fermenting', 'complete'])).toBe('fermenting');
    expect(mashStatusFromFermentations('fermenting', ['fermenting', 'discarded'])).toBe('fermenting');
  });

  it('completes the wash only after every remaining fermenter is finished or discarded', () => {
    expect(mashStatusFromFermentations('fermenting', ['complete', 'discarded'])).toBe('complete');
    expect(mashStatusFromFermentations('fermenting', ['complete'])).toBe('complete');
  });

  it('discards the wash when every fermenter is discarded', () => {
    expect(mashStatusFromFermentations('fermenting', ['discarded'])).toBe('discarded');
  });

  it('sends a fermenting wash back to washing when its last fermenter is removed', () => {
    expect(mashStatusFromFermentations('fermenting', [])).toBe('mashing');
    expect(mashStatusFromFermentations('complete', [])).toBe('complete');
    expect(mashStatusFromFermentations('discarded', [])).toBe('discarded');
  });
});
