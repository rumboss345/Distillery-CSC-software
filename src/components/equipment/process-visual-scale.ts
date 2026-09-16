import type { EquipmentType } from '../../types';

/** Process canvas scale relative to default equipment visuals. */
const PROCESS_VISUAL_SCALE: Partial<Record<EquipmentType, number>> = {
  holding_tank: 0.5,
  fermenter: 2,
  pot_still: 2,
  column_still: 2,
};

export function processEquipmentVisualScale(type: EquipmentType): number {
  return PROCESS_VISUAL_SCALE[type] ?? 1;
}
