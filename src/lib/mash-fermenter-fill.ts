import type { MashStatus } from '../types';

/** Fermenters show assigned wash until it is charged to a still (not when batch is discarded). */
export function fermenterShowsAssignedWash(status: MashStatus): boolean {
  return status === 'fermenting' || status === 'complete';
}

export interface ActiveFermentationAssignment {
  equipmentId: number;
  volumeGal: number;
  status: string;
}

/** Each fermenter holding a fermenting wash counts as one active fermentation. */
export function countActiveFermentations(rows: ActiveFermentationAssignment[]): number {
  const fermenters = new Set<number>();
  for (const row of rows) {
    if (row.status !== 'fermenting') continue;
    if (!(row.volumeGal > 0.01)) continue;
    if (!(row.equipmentId > 0)) continue;
    fermenters.add(row.equipmentId);
  }
  return fermenters.size;
}
