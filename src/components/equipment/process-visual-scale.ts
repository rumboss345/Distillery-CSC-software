import type { EquipmentType } from '../../types';

/** Process canvas scale relative to default equipment visuals. */
const PROCESS_VISUAL_SCALE: Partial<Record<EquipmentType | string, number>> = {
  holding_tank: 0.9,
  collection_vessel: 0.9,
  fermenter: 1.1,
  pot_still: 1,
  column_still: 1,
  pump: 0.85,
  hose: 0.85,
};

export function processEquipmentVisualScale(type: string): number {
  return PROCESS_VISUAL_SCALE[type] ?? 1;
}
