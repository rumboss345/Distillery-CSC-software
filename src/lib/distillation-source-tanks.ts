import { isSpiritLedgerEquipmentType } from './equipment';

/** Holding tanks, stillage tanks, then collection vessels. */
const SOURCE_TANK_TYPE_ORDER = ['holding_tank', 'stillage_tank', 'collection_vessel'] as const;

/** Equipment types a spirit run or gin run can charge, in display order. */
export function distillationSourceTypeChoices(equipmentTypes: readonly string[]): string[] {
  const present = new Set(equipmentTypes.filter((type) => isSpiritLedgerEquipmentType(type)));
  return SOURCE_TANK_TYPE_ORDER.filter((type) => present.has(type));
}

export function tanksOfEquipmentType<T extends { equipment_type: string }>(
  tanks: readonly T[],
  equipmentType: string,
): T[] {
  if (!equipmentType) return [];
  return tanks.filter((tank) => tank.equipment_type === equipmentType);
}
