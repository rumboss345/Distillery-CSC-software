import type { FloorEquipment } from '../types';

/** Equipment emptied after use — must be marked clean before the next batch. */
export function equipmentNeedsCleaning(item: Pick<FloorEquipment, 'status'>): boolean {
  return item.status === 'cleaning';
}

export function equipmentCleaningStatusLabel(): string {
  return 'Needs cleaning';
}
