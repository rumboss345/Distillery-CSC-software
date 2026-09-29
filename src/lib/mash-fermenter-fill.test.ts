import { describe, expect, it } from 'vitest';
import { countActiveFermentations, fermenterShowsAssignedWash } from './mash-fermenter-fill';

describe('fermenterShowsAssignedWash', () => {
  it('shows fill while fermenting and after fermentation complete until charged', () => {
    expect(fermenterShowsAssignedWash('fermenting')).toBe(true);
    expect(fermenterShowsAssignedWash('complete')).toBe(true);
    expect(fermenterShowsAssignedWash('mashing')).toBe(false);
    expect(fermenterShowsAssignedWash('planned')).toBe(false);
    expect(fermenterShowsAssignedWash('discarded')).toBe(false);
  });
});

describe('countActiveFermentations', () => {
  it('counts each fermenter once while the wash is fermenting', () => {
    expect(countActiveFermentations([
      { equipmentId: 1, volumeGal: 100, status: 'fermenting' },
      { equipmentId: 2, volumeGal: 100, status: 'fermenting' },
      { equipmentId: 1, volumeGal: 50, status: 'fermenting' },
      { equipmentId: 3, volumeGal: 80, status: 'complete' },
      { equipmentId: 4, volumeGal: 80, status: 'mashing' },
      { equipmentId: 5, volumeGal: 0, status: 'fermenting' },
    ])).toBe(2);
  });
});
