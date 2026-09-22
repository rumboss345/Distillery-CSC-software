import { describe, expect, it } from 'vitest';
import { fermenterShowsAssignedWash } from './mash-fermenter-fill';

describe('fermenterShowsAssignedWash', () => {
  it('shows fill while fermenting and after fermentation complete until charged', () => {
    expect(fermenterShowsAssignedWash('fermenting')).toBe(true);
    expect(fermenterShowsAssignedWash('complete')).toBe(true);
    expect(fermenterShowsAssignedWash('mashing')).toBe(false);
    expect(fermenterShowsAssignedWash('planned')).toBe(false);
    expect(fermenterShowsAssignedWash('discarded')).toBe(false);
  });
});
