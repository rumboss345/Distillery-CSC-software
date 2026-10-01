import type { EquipmentType, EquipmentStatus } from '../types';
import { fermenterLiquidBrixPhase } from './fermentation';

export const EQUIPMENT_TYPES: { value: EquipmentType; label: string }[] = [
  { value: 'fermenter', label: 'Fermenter' },
  { value: 'mash_tun', label: 'Wash Tank' },
  { value: 'holding_tank', label: 'Holding Tank' },
  { value: 'stillage_tank', label: 'Stillage Tank' },
  { value: 'collection_vessel', label: 'Collection Vessels' },
  { value: 'pot_still', label: 'Pot Still' },
  { value: 'column_still', label: 'Column Still' },
  { value: 'boiler', label: 'Boiler' },
  { value: 'pump', label: 'Pump' },
  { value: 'hose', label: 'Hose' },
  { value: 'other', label: 'Other' },
];

/** Pictures you can assign when adding or editing equipment. */
export const EQUIPMENT_ICONS = EQUIPMENT_TYPES;

export const EQUIPMENT_STATUSES: EquipmentStatus[] = [
  'empty', 'in_use', 'cleaning', 'offline',
];

export const TYPE_COLORS: Record<EquipmentType, string> = {
  fermenter: '#6b9e78',
  mash_tun: '#8b7355',
  holding_tank: '#6a9ec9',
  stillage_tank: '#6b6258',
  collection_vessel: '#7c8fd4',
  pot_still: '#c8956c',
  column_still: '#d4a04a',
  boiler: '#c96a6a',
  pump: '#3d8f8a',
  hose: '#4d7a52',
  other: '#9a928a',
};

/** Distinct colours when equipment is actively running */
export const IN_USE_COLORS = {
  fermenter: '#22c55e',
  fermenterHighBrix: '#dc2626',
  still: '#f97316',
  holding_tank: '#38bdf8',
  default: '#38bdf8',
} as const;

export function getFermenterInUseDisplayColor(latestBrix: number | null | undefined): string {
  const phase = fermenterLiquidBrixPhase(latestBrix);
  if (phase === 'ready') return IN_USE_COLORS.fermenter;
  return IN_USE_COLORS.fermenterHighBrix;
}

function builtInEquipmentType(type: string): EquipmentType | null {
  return EQUIPMENT_TYPES.some((item) => item.value === type) ? type as EquipmentType : null;
}

export function getEquipmentDisplayColor(
  type: string,
  status: EquipmentStatus,
  options?: { fermenterLatestBrix?: number | null },
): string {
  const known = builtInEquipmentType(type);
  if (status === 'in_use') {
    if (known === 'fermenter') {
      return getFermenterInUseDisplayColor(options?.fermenterLatestBrix);
    }
    if (known === 'pot_still' || known === 'column_still') return IN_USE_COLORS.still;
    if (known === 'holding_tank' || known === 'stillage_tank' || known === 'collection_vessel') return IN_USE_COLORS.holding_tank;
    return IN_USE_COLORS.default;
  }
  if (status === 'cleaning') return '#eab308';
  if (status === 'offline') return '#64748b';
  return known ? TYPE_COLORS[known] : TYPE_COLORS.other;
}

export function equipmentTypeDefaults(type: string): { width_ft: number; depth_ft: number; capacity_gal: number } {
  const known = builtInEquipmentType(type);
  return known ? TYPE_DEFAULTS[known] : TYPE_DEFAULTS.other;
}

export const TYPE_DEFAULTS: Record<EquipmentType, { width_ft: number; depth_ft: number; capacity_gal: number }> = {
  fermenter: { width_ft: 10, depth_ft: 10, capacity_gal: 1000 },
  mash_tun: { width_ft: 14, depth_ft: 12, capacity_gal: 600 },
  holding_tank: { width_ft: 8, depth_ft: 6, capacity_gal: 100 },
  stillage_tank: { width_ft: 10, depth_ft: 8, capacity_gal: 5000 },
  collection_vessel: { width_ft: 7, depth_ft: 6, capacity_gal: 80 },
  pot_still: { width_ft: 12, depth_ft: 14, capacity_gal: 200 },
  column_still: { width_ft: 8, depth_ft: 20, capacity_gal: 300 },
  boiler: { width_ft: 6, depth_ft: 8, capacity_gal: 0 },
  pump: { width_ft: 4, depth_ft: 3, capacity_gal: 0 },
  hose: { width_ft: 8, depth_ft: 2, capacity_gal: 0 },
  other: { width_ft: 8, depth_ft: 8, capacity_gal: 0 },
};

export function isBuiltInEquipmentType(type: string): type is EquipmentType {
  return EQUIPMENT_TYPES.some((item) => item.value === type);
}

/** Tank, fermenter, wash tank, and still pictures show a fill level and liquid. */
export function equipmentIconShowsVolume(icon: string): boolean {
  return icon === 'fermenter'
    || icon === 'mash_tun'
    || icon === 'holding_tank'
    || icon === 'stillage_tank'
    || icon === 'collection_vessel'
    || icon === 'pot_still'
    || icon === 'column_still';
}

/** Saved icon, otherwise the equipment type when that type has a picture. */
export function resolveEquipmentIcon(icon: string | null | undefined, equipmentType: string): EquipmentType {
  const chosen = (icon ?? '').trim();
  if (isBuiltInEquipmentType(chosen)) return chosen;
  if (isBuiltInEquipmentType(equipmentType)) return equipmentType;
  return 'other';
}

export function equipmentTypeLabel(type: string): string {
  return EQUIPMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function isLiquidVesselEquipmentType(type: string): boolean {
  return isSpiritLedgerEquipmentType(type);
}

/** Holding tanks, stillage tanks, and collection vessels share the spirit ledger. */
export function isSpiritLedgerEquipmentType(type: string): boolean {
  return type === 'holding_tank' || type === 'stillage_tank' || type === 'collection_vessel';
}
