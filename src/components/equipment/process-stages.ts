import { equipmentTypeLabel } from '../../lib/equipment';
import type { FloorEquipmentView } from '../../types';

export interface ProcessStage {
  key: string;
  label: string;
  types: string[];
}

export const PROCESS_STAGES: ProcessStage[] = [
  { key: 'preparation', label: 'Mash / Cook', types: ['mash_tun'] },
  { key: 'fermentation', label: 'Fermenter', types: ['fermenter'] },
  { key: 'distillation', label: 'Distillation', types: ['pot_still', 'column_still', 'boiler'] },
  { key: 'collection', label: 'Collection Vessels', types: ['collection_vessel'] },
  { key: 'storage', label: 'Holding Tanks', types: ['holding_tank'] },
  { key: 'utilities', label: 'Pumps & Hoses', types: ['pump', 'hose'] },
  { key: 'other', label: 'Other Equipment', types: ['other'] },
];

export function groupEquipmentByStage(
  items: (FloorEquipmentView & { plan_name?: string })[],
): { stage: ProcessStage; items: (FloorEquipmentView & { plan_name?: string })[] }[] {
  const assigned = new Set<number>();

  const groups = PROCESS_STAGES.map((stage) => {
    const stageItems = items.filter((item) => {
      if (!stage.types.includes(item.equipment_type)) return false;
      assigned.add(item.id);
      return true;
    });
    return { stage, items: stageItems };
  }).filter((g) => g.items.length > 0);

  const unassigned = items.filter((item) => !assigned.has(item.id));
  const byType = new Map<string, (FloorEquipmentView & { plan_name?: string })[]>();
  for (const item of unassigned) {
    const list = byType.get(item.equipment_type) ?? [];
    list.push(item);
    byType.set(item.equipment_type, list);
  }
  const customTypes = [...byType.keys()].sort((a, b) => (
    equipmentTypeLabel(a).localeCompare(equipmentTypeLabel(b), undefined, { sensitivity: 'base' })
  ));
  for (const type of customTypes) {
    groups.push({
      stage: { key: `type:${type}`, label: equipmentTypeLabel(type), types: [type] },
      items: byType.get(type) ?? [],
    });
  }

  return groups;
}
