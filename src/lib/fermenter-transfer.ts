/** Destination value for discarding wash instead of moving it. */
export const DISCARD_DESTINATION = -1;

export interface FermenterTransferCheck {
  volumeGal: number;
  availableGal: number;
  discarded: boolean;
  destId: number | null;
  sourceId: number;
  destType?: string | null;
  destName?: string;
  destHoldsOtherMash?: boolean;
  destVolumeGal?: number;
  destCapacityGal?: number;
  destNeedsCleaning?: boolean;
  destBlocked?: boolean;
  destOffline?: boolean;
}

/** Wash may move to another fermenter, or be discarded without emptying the source. */
export function fermenterTransferError(input: FermenterTransferCheck): string | null {
  if (!Number.isFinite(input.volumeGal) || !(input.volumeGal > 0)) {
    return 'Enter the volume to transfer.';
  }
  if (input.volumeGal > input.availableGal + 0.01) {
    return `Only ${input.availableGal.toFixed(1)} gal is in this fermenter.`;
  }
  if (input.discarded) return null;
  if (!input.destId) {
    return 'Choose another fermenter, or discard the wash.';
  }
  if (input.destId === input.sourceId) {
    return 'Source and destination fermenters must be different.';
  }
  if (input.destType !== 'fermenter') {
    return 'Fermenter wash can only move to another fermenter or be discarded.';
  }
  const name = input.destName?.trim() || 'That fermenter';
  if (input.destNeedsCleaning) {
    return `${name} needs cleaning and cannot receive wash.`;
  }
  if (input.destBlocked) {
    return `${name} is out of service and cannot receive wash.`;
  }
  if (input.destOffline) {
    return `${name} is offline and cannot receive wash.`;
  }
  if (input.destHoldsOtherMash) {
    return `${name} already holds a different wash.`;
  }
  const capacity = input.destCapacityGal ?? 0;
  if (capacity > 0) {
    const destVolume = input.destVolumeGal ?? 0;
    if (destVolume + input.volumeGal > capacity + 0.01) {
      const room = Math.max(0, capacity - destVolume);
      return `${name} only has ${room.toFixed(1)} gal of room left.`;
    }
  }
  return null;
}
