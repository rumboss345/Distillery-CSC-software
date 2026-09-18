import type { EquipmentStatus, EquipmentType } from '../../types';
import { equipmentTypeLabel } from '../../lib/equipment';
import type { EquipmentVolumeReport } from '../../types';
import type { FloorEquipmentView } from '../../types';
import { estimateAbvFromBrix, fermenterLiquidBrixPhase } from '../../lib/fermentation';
import type { EquipmentVisualData, EquipmentVisualStatus } from './equipment-visual.types';

export function formatGal(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

const CODE_PREFIX: Record<EquipmentType, string> = {
  fermenter: 'F',
  pot_still: 'S',
  column_still: 'C',
  mash_tun: 'M',
  holding_tank: 'T',
  collection_vessel: 'V',
  boiler: 'B',
  other: 'E',
};

export function equipmentCode(type: EquipmentType, id: number): string {
  return `${CODE_PREFIX[type]}${id}`;
}

export function mapVisualStatus(
  equipmentStatus: EquipmentStatus,
  fillPercent: number,
): EquipmentVisualStatus {
  if (equipmentStatus === 'offline') return 'offline';
  if (equipmentStatus === 'cleaning') return 'warning';
  if (fillPercent <= 0 && equipmentStatus === 'empty') return 'empty';
  if (equipmentStatus === 'in_use' || fillPercent > 0) return 'active';
  return 'available';
}

export const STATUS_LABELS: Record<EquipmentVisualStatus, string> = {
  available: 'Available',
  active: 'In use',
  warning: 'Cleaning',
  hold: 'Hold',
  offline: 'Offline',
  empty: 'Empty',
};

export const LIQUID_COLORS: Record<EquipmentVisualStatus, { base: string; highlight: string; edge: string }> = {
  available: { base: '#1a8fb8', highlight: '#5ec8e8', edge: '#0e5f7a' },
  active: { base: '#2a9d4f', highlight: '#6fd98a', edge: '#1a6b35' },
  warning: { base: '#c4841a', highlight: '#f0b84a', edge: '#8a5a0e' },
  hold: { base: '#c43a3a', highlight: '#f07070', edge: '#8a2020' },
  offline: { base: '#5a6270', highlight: '#8a929e', edge: '#3a4048' },
  empty: { base: '#4a5568', highlight: '#718096', edge: '#2d3748' },
};

const FERMENTER_LIQUID_HIGH_BRIX = {
  base: '#b91c1c',
  highlight: '#f87171',
  edge: '#7f1d1d',
};

const FERMENTER_LIQUID_READY = LIQUID_COLORS.active;

export const MASH_WASH_LIQUID = {
  base: '#6b4423',
  highlight: '#c9a06c',
  edge: '#4a3020',
};

export function liquidColorsForFermenter(
  visualStatus: EquipmentVisualStatus,
  latestBrix: number | null | undefined,
): { base: string; highlight: string; edge: string } {
  if (visualStatus !== 'active') return LIQUID_COLORS[visualStatus];
  const phase = fermenterLiquidBrixPhase(latestBrix);
  if (phase === 'ready') return FERMENTER_LIQUID_READY;
  return FERMENTER_LIQUID_HIGH_BRIX;
}

export function buildEquipmentVisualData(
  item: FloorEquipmentView,
  report?: EquipmentVolumeReport,
  planName?: string,
): EquipmentVisualData {
  const capacityGal = item.capacity_gal > 0 ? item.capacity_gal : (report?.capacity_gal ?? 0);
  const currentVolumeGal = Math.max(0, report?.volume_gal ?? item.active_volume_gal ?? 0);
  const fillPercent = capacityGal > 0
    ? Math.min(100, (currentVolumeGal / capacityGal) * 100)
    : (currentVolumeGal > 0 ? 100 : 0);

  const isWashing = item.equipment_type === 'mash_tun' && item.active_mash_status === 'mashing';

  let liquidName = report?.detail || undefined;
  if (!liquidName && item.active_batch_number) {
    liquidName = `Wash ${item.active_batch_number}`;
  }
  if ((item.equipment_type === 'holding_tank' || item.equipment_type === 'collection_vessel') && !liquidName && item.notes) {
    liquidName = item.notes;
  }

  const visualFillPercent = isWashing && fillPercent <= 0
    ? 78
    : fillPercent;

  let estimatedAbv: number | null | undefined;
  if (item.equipment_type === 'fermenter' && item.active_batch_number) {
    const startBrix = item.active_start_brix ?? null;
    const currentBrix = item.active_latest_brix ?? null;
    estimatedAbv = startBrix != null && currentBrix != null
      ? estimateAbvFromBrix(startBrix, currentBrix)
      : null;
  }

  return {
    id: item.id,
    code: equipmentCode(item.equipment_type, item.id),
    name: item.name,
    equipmentType: item.equipment_type,
    typeLabel: equipmentTypeLabel(item.equipment_type),
    capacityGal,
    currentVolumeGal,
    fillPercent: visualFillPercent,
    liquidName: liquidName || undefined,
    abv: report?.abv ?? (item.active_abv != null && item.active_abv > 0 ? item.active_abv : undefined),
    status: isWashing ? 'active' : mapVisualStatus(item.status, fillPercent),
    isFermenting: item.equipment_type === 'fermenter' && item.active_mash_status === 'fermenting',
    isWashing,
    fermenterLatestBrix: item.equipment_type === 'fermenter' ? item.active_latest_brix : undefined,
    estimatedAbv,
    detail: report?.detail || item.notes || undefined,
    planName,
  };
}
