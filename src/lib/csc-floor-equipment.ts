import type { EquipmentType } from '../types';
import { TYPE_DEFAULTS } from './equipment';

export type CscFloorEquipmentSeed = {
  name: string;
  equipment_type: EquipmentType;
  capacity_gal?: number;
  notes?: string;
};

/** CSC distillery floor equipment catalog. Order controls default layout zones. */
export const CSC_FLOOR_EQUIPMENT: CscFloorEquipmentSeed[] = [
  { name: 'Fermentation 1', equipment_type: 'fermenter', capacity_gal: 500 },
  { name: 'Fermentation 2', equipment_type: 'fermenter', capacity_gal: 500 },
  { name: 'Fermentation 3', equipment_type: 'fermenter', capacity_gal: 500 },
  { name: 'Fermentation 4', equipment_type: 'fermenter', capacity_gal: 500 },
  { name: 'Fermentation 6', equipment_type: 'fermenter', capacity_gal: 500 },
  { name: 'Fermentation 7', equipment_type: 'fermenter', capacity_gal: 500 },
  { name: 'Low wines storage Tank 5', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Vodka high proof storage', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Canning blending tank', equipment_type: 'holding_tank', capacity_gal: 400 },
  { name: 'Storage tank for Corn low wines', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Storage for Heavy rum tank', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Storage for High proof cane Spirits 1', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Storage for High proof cane Spirits 2', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Storage for High proof cane Spirits 3', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Storage oak square tank for gold rum', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Blending tank for bulk Spirits', equipment_type: 'holding_tank', capacity_gal: 600 },
  { name: 'Storage tank of tails runs', equipment_type: 'holding_tank', capacity_gal: 400 },
  { name: 'Latina 500L', equipment_type: 'pot_still', capacity_gal: 132, notes: '500L pot still' },
  { name: 'Latina 300-1', equipment_type: 'column_still', capacity_gal: 79, notes: '300L column still' },
  { name: 'Latina 300-2', equipment_type: 'column_still', capacity_gal: 79, notes: '300L column still' },
  { name: 'Latina 300-3', equipment_type: 'column_still', capacity_gal: 79, notes: '300L column still' },
  { name: 'Groen kettle', equipment_type: 'pot_still', capacity_gal: 100 },
  { name: 'Gin Storage milk can 1', equipment_type: 'holding_tank', capacity_gal: 50 },
  { name: 'Gin Storage milk can 2', equipment_type: 'holding_tank', capacity_gal: 50 },
  { name: 'Gin Storage milk can 3', equipment_type: 'holding_tank', capacity_gal: 50 },
  { name: 'Low wines collection tank of Vendome', equipment_type: 'holding_tank', capacity_gal: 300 },
  { name: 'Stillage Storage tank', equipment_type: 'holding_tank', capacity_gal: 400 },
  { name: 'Dunder tank', equipment_type: 'holding_tank', capacity_gal: 400, notes: 'Backset / dunder storage' },
];

export const CSC_FLOOR_PLAN_SIZE = { width_ft: 160, height_ft: 120 };

function layoutPosition(
  item: CscFloorEquipmentSeed,
  indexInType: number,
): { pos_x_ft: number; pos_y_ft: number; width_ft: number; depth_ft: number } {
  const defaults = TYPE_DEFAULTS[item.equipment_type];
  const colWidth = defaults.width_ft + 2;
  const maxCols = Math.max(1, Math.floor((CSC_FLOOR_PLAN_SIZE.width_ft - 4) / colWidth));

  if (item.equipment_type === 'fermenter') {
    return {
      pos_x_ft: 4 + indexInType * colWidth,
      pos_y_ft: 4,
      width_ft: defaults.width_ft,
      depth_ft: defaults.depth_ft,
    };
  }

  if (item.equipment_type === 'pot_still' || item.equipment_type === 'column_still' || item.equipment_type === 'boiler') {
    return {
      pos_x_ft: 4 + indexInType * colWidth,
      pos_y_ft: 28,
      width_ft: defaults.width_ft,
      depth_ft: defaults.depth_ft,
    };
  }

  const tankRow = Math.floor(indexInType / maxCols);
  const tankCol = indexInType % maxCols;
  return {
    pos_x_ft: 4 + tankCol * colWidth,
    pos_y_ft: 52 + tankRow * 16,
    width_ft: defaults.width_ft,
    depth_ft: defaults.depth_ft,
  };
}

export function buildCscFloorEquipmentRows(
  planId = 1,
  options?: { startIndex?: number; demoStatusForFirstTwo?: boolean },
): Array<{
  floor_plan_id: number;
  name: string;
  equipment_type: EquipmentType;
  pos_x_ft: number;
  pos_y_ft: number;
  width_ft: number;
  depth_ft: number;
  capacity_gal: number;
  status: string;
  linked_mash_batch_id: number | null;
  notes: string;
}> {
  const typeCounts: Partial<Record<EquipmentType, number>> = {};
  const startIndex = options?.startIndex ?? 0;

  return CSC_FLOOR_EQUIPMENT.map((item, index) => {
    const typeIndex = typeCounts[item.equipment_type] ?? 0;
    typeCounts[item.equipment_type] = typeIndex + 1;
    const layout = layoutPosition(item, typeIndex);
    const globalIndex = startIndex + index;
    const isDemoFermenter = options?.demoStatusForFirstTwo && globalIndex < 2;

    return {
      floor_plan_id: planId,
      name: item.name,
      equipment_type: item.equipment_type,
      ...layout,
      capacity_gal: item.capacity_gal ?? TYPE_DEFAULTS[item.equipment_type].capacity_gal,
      status: isDemoFermenter ? 'in_use' : 'empty',
      linked_mash_batch_id: isDemoFermenter ? 2 : null,
      notes: item.notes ?? '',
    };
  });
}
