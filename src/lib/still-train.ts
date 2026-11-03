import { queryAll, queryOne } from '../db/sql-session';
import type { DistillationRun, FloorEquipment } from '../types';

export const CARL_LEGACY_STILL_NAME = 'Carl column still';
export const CARL_TRAIN_LABEL = 'Carl';
export const CARL_POT_NAME = 'Carl — pot';
export const CARL_COLUMN_1_NAME = 'Carl — column 1';
export const CARL_COLUMN_2_NAME = 'Carl — column 2';

export interface StillTrain {
  id: number;
  label: string;
  pot_equipment_id: number;
  column1_equipment_id: number;
  column2_equipment_id: number;
}

export type DistillationStillTarget =
  | { kind: 'single'; equipment: FloorEquipment }
  | {
    kind: 'train';
    train: StillTrain;
    pot: FloorEquipment;
    columns: { id: number; label: string; equipment: FloorEquipment }[];
  };

export function getStillTrains(): StillTrain[] {
  return queryAll<StillTrain>(
    `SELECT id, label, pot_equipment_id, column1_equipment_id, column2_equipment_id
     FROM still_trains ORDER BY label COLLATE NOCASE`,
  );
}

export function getStillTrainByPotId(potEquipmentId: number): StillTrain | undefined {
  return queryOne<StillTrain>(
    `SELECT id, label, pot_equipment_id, column1_equipment_id, column2_equipment_id
     FROM still_trains WHERE pot_equipment_id = ?`,
    [potEquipmentId],
  ) ?? undefined;
}

export function getStillTrainMemberIds(): Set<number> {
  const ids = new Set<number>();
  for (const train of getStillTrains()) {
    ids.add(train.pot_equipment_id);
    ids.add(train.column1_equipment_id);
    ids.add(train.column2_equipment_id);
  }
  return ids;
}

export function stillTrainColumnChoices(train: StillTrain): { id: number; label: string }[] {
  return [
    { id: train.column1_equipment_id, label: 'Column 1' },
    { id: train.column2_equipment_id, label: 'Column 2' },
  ];
}

export function buildDistillationStillTargets(equipment: FloorEquipment[]): DistillationStillTarget[] {
  const byId = new Map(equipment.map((item) => [item.id, item]));
  const memberIds = getStillTrainMemberIds();
  const targets: DistillationStillTarget[] = [];

  for (const train of getStillTrains()) {
    const pot = byId.get(train.pot_equipment_id);
    const col1 = byId.get(train.column1_equipment_id);
    const col2 = byId.get(train.column2_equipment_id);
    if (!pot || !col1 || !col2) continue;
    targets.push({
      kind: 'train',
      train,
      pot,
      columns: [
        { id: col1.id, label: 'Column 1', equipment: col1 },
        { id: col2.id, label: 'Column 2', equipment: col2 },
      ],
    });
  }

  for (const item of equipment) {
    if (item.equipment_type !== 'pot_still' && item.equipment_type !== 'column_still') continue;
    if (memberIds.has(item.id)) continue;
    if (item.name === CARL_LEGACY_STILL_NAME) continue;
    targets.push({ kind: 'single', equipment: item });
  }

  return targets.sort((a, b) => {
    const nameA = a.kind === 'train' ? a.train.label : a.equipment.name;
    const nameB = b.kind === 'train' ? b.train.label : b.equipment.name;
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });
}

export function distillationRunUsesStillTrain(run: Pick<DistillationRun, 'still_pot_equipment_id'>): boolean {
  return (run.still_pot_equipment_id ?? 0) > 0;
}

export function formatDistillationStillDisplay(
  run: Pick<DistillationRun, 'still_name' | 'still_pot_equipment_id' | 'still_column_equipment_id'>,
  equipmentById?: Map<number, FloorEquipment>,
): string {
  if (!distillationRunUsesStillTrain(run)) return run.still_name?.trim() || '—';
  const train = getStillTrainByPotId(run.still_pot_equipment_id!);
  const label = train?.label ?? run.still_name?.trim() ?? 'Still train';
  const columnId = run.still_column_equipment_id;
  if (!columnId) return label;
  const colName = equipmentById?.get(columnId)?.name
    ?? queryOne<{ name: string }>('SELECT name FROM floor_equipment WHERE id = ?', [columnId])?.name;
  if (!colName) return label;
  if (colName.includes('column 1')) return `${label} · column 1`;
  if (colName.includes('column 2')) return `${label} · column 2`;
  return `${label} · ${colName}`;
}

/** Equipment that should be marked dirty when a running train run ends or changes. */
export function stillTrainEquipmentToRelease(
  run: Pick<DistillationRun, 'still_pot_equipment_id' | 'still_column_equipment_id'>,
): number[] {
  if (!distillationRunUsesStillTrain(run)) return [];
  const ids = [run.still_pot_equipment_id!];
  if (run.still_column_equipment_id) ids.push(run.still_column_equipment_id);
  return ids;
}

export function stillTrainRunChanged(
  previous: Pick<DistillationRun, 'still_pot_equipment_id' | 'still_column_equipment_id' | 'still_name'> | null | undefined,
  next: Pick<DistillationRun, 'still_pot_equipment_id' | 'still_column_equipment_id' | 'still_name' | 'status'>,
  nextOccupiesStill: boolean,
): boolean {
  if (!previous) return false;
  if (distillationRunUsesStillTrain(previous) || distillationRunUsesStillTrain(next)) {
    return previous.still_pot_equipment_id !== next.still_pot_equipment_id
      || previous.still_column_equipment_id !== next.still_column_equipment_id
      || !nextOccupiesStill;
  }
  return previous.still_name !== next.still_name;
}
