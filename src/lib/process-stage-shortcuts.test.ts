import { describe, expect, it } from 'vitest';
import { shortcutsForAssignments } from './process-stage-shortcuts';
import type { PermissionKey } from './permissions';

describe('shortcutsForAssignments', () => {
  it('dedupes wash and fermentation to one wash link', () => {
    const has = (key: PermissionKey) => key === 'wash' || key === 'distillation';
    const links = shortcutsForAssignments(['preparation', 'fermentation', 'distillation'], has);
    expect(links.map((l) => l.to)).toEqual(['/wash', '/distillation']);
  });

  it('skips stages the user cannot access', () => {
    const has = (key: PermissionKey) => key === 'equipment';
    const links = shortcutsForAssignments(['distillation', 'storage'], has);
    expect(links).toHaveLength(1);
    expect(links[0].to).toBe('/floor-plan');
  });
});
