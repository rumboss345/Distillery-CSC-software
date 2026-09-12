import type { EquipmentType } from '../../types';
import type { FloorEquipmentView } from '../../types';

export interface ProcessStage {
  key: string;
  label: string;
  types: EquipmentType[];
}

export const PROCESS_STAGES: ProcessStage[] = [
  { key: 'preparation', label: 'Mash / Cook', types: ['mash_tun'] },
  { key: 'fermentation', label: 'Fermentation', types: ['fermenter'] },
  { key: 'distillation', label: 'Distillation', types: ['pot_still', 'column_still', 'boiler'] },
  { key: 'storage', label: 'Post-Ferm Holding', types: ['holding_tank'] },
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
  if (unassigned.length > 0) {
    groups.push({
      stage: { key: 'misc', label: 'Miscellaneous', types: [] },
      items: unassigned,
    });
  }

  return groups;
}
