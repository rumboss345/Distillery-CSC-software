import type { EquipmentMaintenanceStatus, FloorEquipment } from '../types';
import { equipmentNeedsCleaning } from './equipment-cleaning';
import { EQUIPMENT_TYPES } from './equipment';

export const MAINTENANCE_STATUS_OPTIONS: {
  value: EquipmentMaintenanceStatus;
  label: string;
  blocksProduction: boolean;
}[] = [
  { value: 'broken', label: 'Broken', blocksProduction: true },
  { value: 'maintenance', label: 'Under maintenance', blocksProduction: true },
  { value: 'repair_note', label: 'Repair note (suggested repairs)', blocksProduction: false },
];

export function equipmentBlocksProduction(
  item: Pick<FloorEquipment, 'maintenance_status'>,
): boolean {
  return item.maintenance_status === 'broken' || item.maintenance_status === 'maintenance';
}

/** Broken/maintenance or post-use cleaning required. */
export function equipmentUnavailableForProduction(
  item: Pick<FloorEquipment, 'maintenance_status' | 'status'>,
): boolean {
  return equipmentBlocksProduction(item) || equipmentNeedsCleaning(item);
}

export function equipmentHasMaintenanceTag(
  item: Pick<FloorEquipment, 'maintenance_status'>,
): boolean {
  return item.maintenance_status != null;
}

export function equipmentShowsRepairNoteIndicator(
  item: Pick<FloorEquipment, 'maintenance_status'>,
): boolean {
  return item.maintenance_status === 'repair_note';
}

export function maintenanceStatusLabel(status: EquipmentMaintenanceStatus | null | undefined): string {
  if (!status) return 'Operational';
  return MAINTENANCE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function groupEquipmentByCategory<T extends Pick<FloorEquipment, 'equipment_type'>>(
  items: T[],
): { type: string; label: string; items: T[] }[] {
  const byType = new Map<string, T[]>();
  for (const item of items) {
    const list = byType.get(item.equipment_type) ?? [];
    list.push(item);
    byType.set(item.equipment_type, list);
  }
  const sortItems = (list: T[]) => list.slice().sort((a, b) => {
    const an = 'name' in a ? String((a as { name: string }).name) : '';
    const bn = 'name' in b ? String((b as { name: string }).name) : '';
    return an.localeCompare(bn, undefined, { sensitivity: 'base' });
  });
  const extraTypes = [...byType.keys()]
    .filter((type) => !EQUIPMENT_TYPES.some((item) => item.value === type))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return [...EQUIPMENT_TYPES.map((item) => item.value), ...extraTypes].map((value) => ({
    type: value,
    label: EQUIPMENT_TYPES.find((item) => item.value === value)?.label ?? value,
    items: sortItems(byType.get(value) ?? []),
  })).filter((group) => group.items.length > 0);
}
