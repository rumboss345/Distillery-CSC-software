import type { FloorEquipment } from '../types';
import { CALENDAR_CLEANING_EQUIPMENT_TYPES } from './equipment-cleaning';

/** Tanks, fermenters, and stills hold liquid and are handled by their own records, not picked as bottling equipment. */
export function isBottlingEquipmentType(type: string): boolean {
  return !(CALENDAR_CLEANING_EQUIPMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Equipment that can be picked for a bottling run: bottling lines, pumps, hoses, filters, and so on.
 * Already-saved picks stay listed even if they are now dirty or offline.
 */
export function bottlingEquipmentOptions<T extends Pick<FloorEquipment, 'id' | 'name' | 'equipment_type'>>(
  equipment: T[],
  selectedIds: number[] = [],
): T[] {
  return equipment
    .filter((item) => isBottlingEquipmentType(item.equipment_type) || selectedIds.includes(item.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function uniqueEquipmentIds(ids: (number | null | undefined)[] | null | undefined): number[] {
  const seen = new Set<number>();
  for (const id of ids ?? []) {
    if (id != null && Number.isInteger(id) && id > 0) seen.add(id);
  }
  return [...seen];
}

/**
 * Equipment to mark dirty when a running or finished bottling is saved.
 * Newly picked equipment is always marked. Equipment already on the run is marked again
 * only when a new session is recorded (status changed or more bottles), so editing notes
 * on a finished run does not undo a cleaning.
 */
export function bottlingEquipmentToMarkDirty(input: {
  selectedIds: number[];
  previousIds: number[];
  previousUsed: boolean;
  nowUsed: boolean;
  newSession: boolean;
}): number[] {
  if (!input.nowUsed) return [];
  return input.selectedIds.filter((id) => (
    !input.previousUsed || !input.previousIds.includes(id) || input.newSession
  ));
}

/** Equipment whose dirty hold from this run should be released (run back to planned, item removed, or run deleted). */
export function bottlingEquipmentToRelease(input: {
  selectedIds: number[];
  previousIds: number[];
  previousUsed: boolean;
  nowUsed: boolean;
}): number[] {
  if (!input.previousUsed) return [];
  if (!input.nowUsed) return input.previousIds;
  return input.previousIds.filter((id) => !input.selectedIds.includes(id));
}
