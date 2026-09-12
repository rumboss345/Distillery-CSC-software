import type { FloorEquipmentView } from '../../types';
import type { TankVisualData, TankVisualStatus } from './tank-visual.types';

function mapEquipmentStatus(
  equipmentStatus: FloorEquipmentView['status'],
  fillPercent: number,
): TankVisualStatus {
  if (equipmentStatus === 'offline') return 'offline';
  if (equipmentStatus === 'cleaning') return 'warning';
  if (fillPercent <= 0) return 'empty';
  if (equipmentStatus === 'in_use') return 'active';
  return 'available';
}

function tankCode(equipmentId: number): string {
  return `T${equipmentId}`;
}

function inferLiquidName(item: FloorEquipmentView): string | undefined {
  const n = item.name.toLowerCase();
  if (n.includes('low wine')) return 'Low wines';
  if (n.includes('spirit') || n.includes('high')) return 'High wines / hearts';
  if (n.includes('heads')) return 'Heads';
  if (n.includes('tails')) return 'Tails';
  if (item.notes) return item.notes;
  return undefined;
}

/**
 * Build TankVisualData from floor equipment view.
 * Volume/ABV come from getFloorEquipmentWithContext → getHoldingTankContents (ledger).
 */
export function tankVisualDataFromEquipment(item: FloorEquipmentView): TankVisualData {
  const capacityGal = item.capacity_gal > 0 ? item.capacity_gal : 0;
  const currentVolumeGal = Math.max(0, item.active_volume_gal ?? 0);
  const fillPercent = capacityGal > 0
    ? Math.min(100, (currentVolumeGal / capacityGal) * 100)
    : 0;

  return {
    id: item.id,
    code: tankCode(item.id),
    name: item.name,
    tankType: 'Holding tank',
    capacityGal,
    currentVolumeGal,
    fillPercent,
    liquidName: inferLiquidName(item),
    abv: item.active_abv != null && item.active_abv > 0 ? item.active_abv : undefined,
    status: mapEquipmentStatus(item.status, fillPercent),
    equipmentStatus: item.status,
  };
}
