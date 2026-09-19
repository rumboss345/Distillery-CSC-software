import { getEquipmentVolumeReport } from '../../db/queries';
import { equipmentTypeLabel } from '../equipment';
import { roundVolume } from './alcohol-units';
import { buildLiquidMovements, type LiquidMovementRow } from './movements';
import type { ReportDateRange } from './period';

export interface TankInventoryReportRow {
  equipment_id: number;
  name: string;
  equipment_type: string;
  status: string;
  capacity_gal: number;
  volume_gal: number;
  abv: number | null;
  laa_gal: number;
  fill_pct: number | null;
  detail: string;
  last_movement_at: string | null;
  last_movement_type: string | null;
}

export function lastMovementForTankName(
  tankName: string,
  movements: LiquidMovementRow[],
): Pick<TankInventoryReportRow, 'last_movement_at' | 'last_movement_type'> {
  for (const m of movements) {
    if (m.source_label === tankName || m.dest_label === tankName) {
      return { last_movement_at: m.occurred_at, last_movement_type: m.movement_type };
    }
  }
  return { last_movement_at: null, last_movement_type: null };
}

export function buildTankInventoryReportRows(
  _range: ReportDateRange,
): TankInventoryReportRow[] {
  const movements = buildLiquidMovements({ preset: 'all', from: null, to: null, label: 'All' });
  const equipment = getEquipmentVolumeReport().filter(
    (eq) => eq.equipment_type === 'holding_tank' || eq.equipment_type === 'collection_vessel',
  );

  return equipment.map((eq) => {
    const laa =
      eq.abv != null && eq.volume_gal > 0
        ? roundVolume(eq.volume_gal * (eq.abv / 100))
        : 0;
    const fillPct =
      eq.capacity_gal > 0 ? Math.round((eq.volume_gal / eq.capacity_gal) * 1000) / 10 : null;
    const last = lastMovementForTankName(eq.name, movements);

    return {
      equipment_id: eq.id,
      name: eq.name,
      equipment_type: equipmentTypeLabel(eq.equipment_type),
      status: eq.status,
      capacity_gal: eq.capacity_gal,
      volume_gal: eq.volume_gal,
      abv: eq.abv,
      laa_gal: laa,
      fill_pct: fillPct,
      detail: eq.detail || '',
      last_movement_at: last.last_movement_at,
      last_movement_type: last.last_movement_type,
    };
  }).sort((a, b) => b.volume_gal - a.volume_gal);
}
