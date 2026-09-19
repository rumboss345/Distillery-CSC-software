import type { MashStatus } from '../types';

/** Fermenters show volume / in-use on the floor plan only while the wash is fermenting. */
export function fermenterShowsAssignedWash(status: MashStatus): boolean {
  return status === 'fermenting';
}
