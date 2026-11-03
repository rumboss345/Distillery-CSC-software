import type { FloorEquipment } from '../types';
import { CALENDAR_CLEANING_EQUIPMENT_TYPES } from './equipment-cleaning';
import { resolveEquipmentIcon } from './equipment';

export function isBottlingLineEquipment(
  item: Pick<FloorEquipment, 'icon' | 'equipment_type'>,
): boolean {
  return resolveEquipmentIcon(item.icon, item.equipment_type) === 'bottling_line';
}

/** Tanks, fermenters, and stills hold liquid and are handled by their own records, not picked as bottling equipment. */
export function isBottlingEquipmentType(type: string): boolean {
  return !(CALENDAR_CLEANING_EQUIPMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Equipment that can be picked for a bottling run: bottling lines, pumps, hoses, filters, and so on.
 * Already-saved picks stay listed even if they are now dirty or offline.
 */
export function bottlingEquipmentOptions<T extends Pick<FloorEquipment, 'id' | 'name' | 'equipment_type' | 'icon'>>(
  equipment: T[],
  selectedIds: number[] = [],
): T[] {
  return equipment
    .filter((item) => (
      (isBottlingEquipmentType(item.equipment_type) && !isBottlingLineEquipment(item))
      || selectedIds.includes(item.id)
    ))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function splitBottlingRunEquipmentIds(
  equipmentIds: number[],
  equipment: Pick<FloorEquipment, 'id' | 'icon' | 'equipment_type'>[],
): { lineId: number | null; auxiliaryIds: number[] } {
  const byId = new Map(equipment.map((item) => [item.id, item]));
  let lineId: number | null = null;
  const auxiliaryIds: number[] = [];
  for (const id of equipmentIds) {
    const item = byId.get(id);
    if (!item) {
      auxiliaryIds.push(id);
      continue;
    }
    if (!lineId && isBottlingLineEquipment(item)) {
      lineId = id;
      continue;
    }
    auxiliaryIds.push(id);
  }
  return { lineId, auxiliaryIds };
}

export function mergeBottlingRunEquipmentIds(lineId: number | null | undefined, auxiliaryIds: number[]): number[] {
  return uniqueEquipmentIds([
    ...(lineId != null && lineId > 0 ? [lineId] : []),
    ...auxiliaryIds,
  ]);
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
