import { describe, expect, it } from 'vitest';
import {
  collectionVesselAcceptsIncomingCut,
  collectionVesselContentsLabel,
  inflowsAreStillageOnly,
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

  it('recognizes a vessel whose current gallons are only stillage', () => {
    expect(inflowsAreStillageOnly(
      [{ volumeGal: 40, cutType: null, stillage: true }],
      40,
    )).toBe(true);
    expect(inflowsAreStillageOnly(
      [
        { volumeGal: 15, cutType: null, stillage: true },
        { volumeGal: 40, cutType: 'hearts' },
      ],
      15,
    )).toBe(true);
    expect(inflowsAreStillageOnly(
      [
        { volumeGal: 10, cutType: 'tails' },
        { volumeGal: 30, cutType: null, stillage: true },
      ],
      20,
    )).toBe(false);
    expect(inflowsAreStillageOnly(
      [{ volumeGal: 10, cutType: null, stillage: true }],
      25,
    )).toBe(false);
  });

  it('names the spirit, stillage, or mix currently in a collection vessel', () => {
    expect(collectionVesselContentsLabel({ volumeGal: 0, stored: 'hearts', stillageGal: 0 })).toBeNull();
    expect(collectionVesselContentsLabel({ volumeGal: 8, stored: 'hearts', stillageGal: 0 })).toBe('Hearts');
    expect(collectionVesselContentsLabel({ volumeGal: 3.2, stored: 'heads', stillageGal: 0 })).toBe('Heads');
    expect(collectionVesselContentsLabel({ volumeGal: 12, stored: 'mixed', stillageGal: 12 })).toBe('Stillage');
    expect(collectionVesselContentsLabel({ volumeGal: 20, stored: 'mixed', stillageGal: 8 })).toBe('Mixed');
  });
});
