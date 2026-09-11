import type { EquipmentType, EquipmentStatus } from '../types';

export const EQUIPMENT_TYPES: { value: EquipmentType; label: string }[] = [
  { value: 'fermenter', label: 'Fermenter' },
  { value: 'pot_still', label: 'Pot Still' },
  { value: 'column_still', label: 'Column Still' },
  { value: 'mash_tun', label: 'Wash Tank' },
  { value: 'holding_tank', label: 'Holding Tank' },
  { value: 'boiler', label: 'Boiler' },
  { value: 'other', label: 'Other' },
];

export const EQUIPMENT_STATUSES: EquipmentStatus[] = [
  'empty', 'in_use', 'cleaning', 'offline',
];

export const TYPE_COLORS: Record<EquipmentType, string> = {
  fermenter: '#6b9e78',
  pot_still: '#c8956c',
  column_still: '#d4a04a',
  mash_tun: '#8b7355',
  holding_tank: '#6a9ec9',
  boiler: '#c96a6a',
  other: '#9a928a',
};

/** Distinct colours when equipment is actively running */
export const IN_USE_COLORS = {
  fermenter: '#22c55e',
  still: '#f97316',
  holding_tank: '#38bdf8',
  default: '#38bdf8',
} as const;

export function getEquipmentDisplayColor(
  type: EquipmentType,
  status: EquipmentStatus,
): string {
  if (status === 'in_use') {
    if (type === 'fermenter') return IN_USE_COLORS.fermenter;
    if (type === 'pot_still' || type === 'column_still') return IN_USE_COLORS.still;
    if (type === 'holding_tank') return IN_USE_COLORS.holding_tank;
    return IN_USE_COLORS.default;
  }
  if (status === 'cleaning') return '#eab308';
  if (status === 'offline') return '#64748b';
  return TYPE_COLORS[type];
}

export const TYPE_DEFAULTS: Record<EquipmentType, { width_ft: number; depth_ft: number; capacity_gal: number }> = {
  fermenter: { width_ft: 10, depth_ft: 10, capacity_gal: 500 },
  pot_still: { width_ft: 12, depth_ft: 14, capacity_gal: 200 },
  column_still: { width_ft: 8, depth_ft: 20, capacity_gal: 300 },
  mash_tun: { width_ft: 14, depth_ft: 12, capacity_gal: 600 },
  holding_tank: { width_ft: 8, depth_ft: 6, capacity_gal: 100 },
  boiler: { width_ft: 6, depth_ft: 8, capacity_gal: 0 },
  other: { width_ft: 8, depth_ft: 8, capacity_gal: 0 },
};

export function equipmentTypeLabel(type: EquipmentType): string {
  return EQUIPMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}
