import { describe, expect, it } from 'vitest';

function vesselAcceptsCutType(stored: string | null, incoming: string): boolean {
  return stored == null || stored === incoming;
}

describe('collection vessel cut type rule', () => {
  it('allows empty vessel for any cut type', () => {
    expect(vesselAcceptsCutType(null, 'hearts')).toBe(true);
  });

  it('allows same cut type as already stored', () => {
    expect(vesselAcceptsCutType('hearts', 'hearts')).toBe(true);
  });

  it('rejects mixing cut types in one vessel', () => {
    expect(vesselAcceptsCutType('hearts', 'tails')).toBe(false);
    expect(vesselAcceptsCutType('heads', 'hearts')).toBe(false);
  });
});
