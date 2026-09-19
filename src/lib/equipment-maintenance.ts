import type { EquipmentMaintenanceStatus, EquipmentType, FloorEquipment } from '../types';
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
): { type: EquipmentType; label: string; items: T[] }[] {
  const byType = new Map<EquipmentType, T[]>();
  for (const item of items) {
    const list = byType.get(item.equipment_type) ?? [];
    list.push(item);
    byType.set(item.equipment_type, list);
  }
  return EQUIPMENT_TYPES.map(({ value, label }) => ({
    type: value,
    label,
    items: (byType.get(value) ?? []).slice().sort((a, b) => {
      const an = 'name' in a ? String((a as { name: string }).name) : '';
      const bn = 'name' in b ? String((b as { name: string }).name) : '';
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    }),
  })).filter((g) => g.items.length > 0);
}
