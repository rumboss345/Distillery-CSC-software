import type { EquipmentType } from '../types';
import { TYPE_DEFAULTS } from './equipment';
import {
  CARL_COLUMN_1_NAME,
  CARL_COLUMN_2_NAME,
  CARL_POT_NAME,
} from './still-train';

export type CscFloorEquipmentSeed = {
  name: string;
  equipment_type: EquipmentType;
  capacity_gal?: number;
  notes?: string;
};

/** CSC distillery floor equipment catalog. Order controls default layout zones. */
export const CSC_FLOOR_EQUIPMENT: CscFloorEquipmentSeed[] = [
  { name: 'Fermentation 1', equipment_type: 'fermenter', capacity_gal: 1000 },
  { name: 'Fermentation 2', equipment_type: 'fermenter', capacity_gal: 1000 },
  { name: 'Fermentation 3', equipment_type: 'fermenter', capacity_gal: 1000 },
  { name: 'Fermentation 4', equipment_type: 'fermenter', capacity_gal: 1000 },
  { name: 'Fermentation 6', equipment_type: 'fermenter', capacity_gal: 1000 },
  { name: 'Fermentation 7', equipment_type: 'fermenter', capacity_gal: 1000 },
  { name: 'Low wines storage Tank 5', equipment_type: 'holding_tank', capacity_gal: 2000 },
  { name: 'Vodka high proof storage', equipment_type: 'holding_tank', capacity_gal: 250 },
  { name: 'Canning blending tank', equipment_type: 'holding_tank', capacity_gal: 250 },
  { name: 'Storage tank for Corn low wines', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Storage for Heavy rum tank', equipment_type: 'holding_tank', capacity_gal: 250 },
  { name: 'Storage for High proof cane Spirits 1', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Storage for High proof cane Spirits 2', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Storage for High proof cane Spirits 3', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Storage oak square tank for gold rum', equipment_type: 'holding_tank', capacity_gal: 500 },
  { name: 'Blending tank for bulk Spirits', equipment_type: 'holding_tank', capacity_gal: 250 },
  { name: 'Storage tank of tails runs', equipment_type: 'holding_tank', capacity_gal: 250 },
  { name: 'Latina 500L', equipment_type: 'collection_vessel', capacity_gal: 132, notes: '500L collection vessel' },
  { name: 'Latina 300-1', equipment_type: 'collection_vessel', capacity_gal: 79, notes: '300L collection vessel' },
  { name: 'Latina 300-2', equipment_type: 'collection_vessel', capacity_gal: 79, notes: '300L collection vessel' },
  { name: 'Latina 300-3', equipment_type: 'collection_vessel', capacity_gal: 79, notes: '300L collection vessel' },
  { name: 'Groen kettle', equipment_type: 'mash_tun', capacity_gal: 100, notes: 'Groen wash kettle' },
  { name: 'Wash tank', equipment_type: 'mash_tun', capacity_gal: 2000, notes: 'Primary wash tank' },
  { name: 'Vendome', equipment_type: 'pot_still', capacity_gal: 1200, notes: '1200 gal pot still' },
  { name: CARL_POT_NAME, equipment_type: 'pot_still', capacity_gal: 200, notes: 'Carl still shared pot' },
  { name: CARL_COLUMN_1_NAME, equipment_type: 'column_still', capacity_gal: 200, notes: 'Carl still column 1' },
  { name: CARL_COLUMN_2_NAME, equipment_type: 'column_still', capacity_gal: 200, notes: 'Carl still column 2' },
  { name: 'Hill billy', equipment_type: 'column_still', capacity_gal: 50, notes: '50 gal column still' },
  { name: 'Gin Storage milk can 1', equipment_type: 'holding_tank', capacity_gal: 50 },
  { name: 'Gin Storage milk can 2', equipment_type: 'holding_tank', capacity_gal: 50 },
  { name: 'Gin Storage milk can 3', equipment_type: 'holding_tank', capacity_gal: 50 },
  { name: 'Low wines collection tank of Vendome', equipment_type: 'collection_vessel', capacity_gal: 300 },
  { name: 'Stillage Storage tank', equipment_type: 'stillage_tank', capacity_gal: 5000 },
  { name: 'Dunder tank', equipment_type: 'holding_tank', capacity_gal: 1000, notes: 'Backset / dunder storage' },
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
  floorPlanId: number,
  options?: { demoStatusForFirstTwo?: boolean },
): Array<{
  floor_plan_id: number;
  name: string;
  equipment_type: string;
  pos_x_ft: number;
  pos_y_ft: number;
  width_ft: number;
  depth_ft: number;
  capacity_gal: number;
  status: string;
  linked_mash_batch_id: number | null;
  notes: string;
}> {
  const counts = new Map<string, number>();
  return CSC_FLOOR_EQUIPMENT.map((item, index) => {
    const typeIndex = counts.get(item.equipment_type) ?? 0;
    counts.set(item.equipment_type, typeIndex + 1);
    const pos = layoutPosition(item, typeIndex);
    const defaults = TYPE_DEFAULTS[item.equipment_type];
    return {
      floor_plan_id: floorPlanId,
      name: item.name,
      equipment_type: item.equipment_type,
      pos_x_ft: pos.pos_x_ft,
      pos_y_ft: pos.pos_y_ft,
      width_ft: pos.width_ft,
      depth_ft: pos.depth_ft,
      capacity_gal: item.capacity_gal ?? defaults.capacity_gal,
      status: options?.demoStatusForFirstTwo && index < 2 ? 'in_use' : 'empty',
      linked_mash_batch_id: null,
      notes: item.notes ?? '',
    };
  });
}
