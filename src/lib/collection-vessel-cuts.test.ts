import { describe, expect, it } from 'vitest';
import {
  collectionVesselAcceptsIncomingCut,
  storedCutTypeFromInflows,
} from './collection-vessel-cuts';

describe('collection vessel cut type rule', () => {
  it('unlocks an empty vessel for any cut from any run', () => {
    expect(storedCutTypeFromInflows(
      [{ volumeGal: 40, cutType: 'hearts' }],
      0,
    )).toBeNull();
    expect(collectionVesselAcceptsIncomingCut(null, 'tails')).toBe(true);
    expect(collectionVesselAcceptsIncomingCut(null, 'heads')).toBe(true);
  });

  it('keeps the cut that still fills the vessel', () => {
    expect(storedCutTypeFromInflows(
      [
        { volumeGal: 20, cutType: 'tails' },
        { volumeGal: 50, cutType: 'hearts' },
      ],
      20,
    )).toBe('tails');
    expect(collectionVesselAcceptsIncomingCut('tails', 'tails')).toBe(true);
    expect(collectionVesselAcceptsIncomingCut('tails', 'hearts')).toBe(false);
  });

  it('rejects a vessel whose current gallons mix cut types', () => {
    expect(storedCutTypeFromInflows(
      [
        { volumeGal: 20, cutType: 'tails' },
        { volumeGal: 30, cutType: 'hearts' },
      ],
      50,
    )).toBe('mixed');
    expect(collectionVesselAcceptsIncomingCut('mixed', 'hearts')).toBe(false);
    expect(collectionVesselAcceptsIncomingCut('heads', 'hearts')).toBe(false);
  });
});
