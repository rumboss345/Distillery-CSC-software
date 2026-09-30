import { describe, expect, it } from 'vitest';
import { fermenterTransferError } from './fermenter-transfer';

const base = {
  volumeGal: 10,
  availableGal: 112.5,
  discarded: false,
  destId: 3,
  sourceId: 1,
  destType: 'fermenter',
  destName: 'Fermentation 3',
  destHoldsOtherMash: false,
  destVolumeGal: 0,
  destCapacityGal: 1000,
  destNeedsCleaning: false,
  destBlocked: false,
  destOffline: false,
};

describe('fermenter wash transfers', () => {
  it('allows a partial move to another fermenter', () => {
    expect(fermenterTransferError(base)).toBeNull();
  });

  it('allows discarding part of the wash without emptying the fermenter', () => {
    expect(fermenterTransferError({
      ...base,
      discarded: true,
      destId: null,
      volumeGal: 5,
    })).toBeNull();
    expect(fermenterTransferError({
      ...base,
      discarded: true,
      destId: null,
      volumeGal: 112.5,
    })).toBeNull();
  });

  it('rejects a missing volume, an overdraw, and a tank destination', () => {
    expect(fermenterTransferError({ ...base, volumeGal: 0 })).toMatch(/volume/);
    expect(fermenterTransferError({ ...base, volumeGal: 200 })).toMatch(/Only 112.5 gal/);
    expect(fermenterTransferError({ ...base, destType: 'holding_tank', destName: 'Stillage Storage tank' }))
      .toMatch(/leftovers/);
    expect(fermenterTransferError({ ...base, destId: null, discarded: false }))
      .toMatch(/leftovers/);
    expect(fermenterTransferError({ ...base, destId: 1 })).toMatch(/must be different/);
  });

  it('rejects a destination that is dirty, blocked, offline, mixed, or full', () => {
    expect(fermenterTransferError({ ...base, destNeedsCleaning: true })).toMatch(/needs cleaning/);
    expect(fermenterTransferError({ ...base, destBlocked: true })).toMatch(/out of service/);
    expect(fermenterTransferError({ ...base, destOffline: true })).toMatch(/offline/);
    expect(fermenterTransferError({ ...base, destHoldsOtherMash: true })).toMatch(/different wash/);
    expect(fermenterTransferError({
      ...base,
      destVolumeGal: 950,
      destCapacityGal: 1000,
      volumeGal: 60,
    })).toMatch(/50.0 gal of room left/);
  });
});
