import type { MashStatus } from '../types';

/** Fermenters show assigned wash until it is charged to a still (not when batch is discarded). */
export function fermenterShowsAssignedWash(status: MashStatus): boolean {
  return status === 'fermenting' || status === 'complete';
}
