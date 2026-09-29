import type { FloorEquipment } from '../types';

/** Equipment emptied after use — must be marked clean before the next batch. */
export function equipmentNeedsCleaning(item: Pick<FloorEquipment, 'status'>): boolean {
  return item.status === 'cleaning';
}

export function equipmentCleaningStatusLabel(): string {
  return 'Needs cleaning';
}

/**
 * Putting a record back to planned cancels the use.
 * An in-use or cleaning hold is released; liquid that is still there stays in use.
 * Returns null when the status should be left alone.
 */
export function equipmentStatusWhenReturningToPlanned(
  status: string,
  hasContents: boolean,
): 'empty' | 'in_use' | null {
  if (status !== 'in_use' && status !== 'cleaning') return null;
  return hasContents ? 'in_use' : 'empty';
}
