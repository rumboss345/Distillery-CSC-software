import { describe, expect, it } from 'vitest';
import { fermenterShowsAssignedWash } from './mash-fermenter-fill';

describe('fermenterShowsAssignedWash', () => {
  it('shows fill only while fermenting', () => {
    expect(fermenterShowsAssignedWash('fermenting')).toBe(true);
    expect(fermenterShowsAssignedWash('mashing')).toBe(false);
    expect(fermenterShowsAssignedWash('planned')).toBe(false);
    expect(fermenterShowsAssignedWash('complete')).toBe(false);
    expect(fermenterShowsAssignedWash('discarded')).toBe(false);
  });
});
