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
  /** Process view / distillation label (e.g. Carl column still). */
  display_equipment_id: number | null;
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
    display: FloorEquipment;
    columns: { id: number; label: string; equipment: FloorEquipment }[];
  };

export function getStillTrains(): StillTrain[] {
  return queryAll<StillTrain>(
    `SELECT id, label, display_equipment_id, pot_equipment_id, column1_equipment_id, column2_equipment_id
     FROM still_trains ORDER BY label COLLATE NOCASE`,
  );
}

export function getStillTrainByPotId(potEquipmentId: number): StillTrain | undefined {
  return queryOne<StillTrain>(
    `SELECT id, label, display_equipment_id, pot_equipment_id, column1_equipment_id, column2_equipment_id
     FROM still_trains WHERE pot_equipment_id = ?`,
    [potEquipmentId],
  ) ?? undefined;
}

export function getStillTrainByDisplayEquipmentId(displayEquipmentId: number): StillTrain | undefined {
  return queryOne<StillTrain>(
    `SELECT id, label, display_equipment_id, pot_equipment_id, column1_equipment_id, column2_equipment_id
     FROM still_trains WHERE display_equipment_id = ?`,
    [displayEquipmentId],
  ) ?? undefined;
}

/** Pot and column records kept for cleaning; only the display piece appears on the process view. */
export function stillTrainHiddenFromProcessIds(): Set<number> {
  const hidden = new Set<number>();
  for (const train of getStillTrains()) {
    const displayId = train.display_equipment_id ?? 0;
    for (const id of [train.pot_equipment_id, train.column1_equipment_id, train.column2_equipment_id]) {
      if (id > 0 && id !== displayId) hidden.add(id);
    }
  }
  return hidden;
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
  const hiddenIds = stillTrainHiddenFromProcessIds();
  const displayIds = new Set(
    getStillTrains()
      .map((train) => train.display_equipment_id)
      .filter((id): id is number => (id ?? 0) > 0),
  );
  const targets: DistillationStillTarget[] = [];

  for (const train of getStillTrains()) {
    const pot = byId.get(train.pot_equipment_id);
    const col1 = byId.get(train.column1_equipment_id);
    const col2 = byId.get(train.column2_equipment_id);
    const display = byId.get(train.display_equipment_id ?? 0) ?? pot;
    if (!pot || !col1 || !col2 || !display) continue;
    targets.push({
      kind: 'train',
      train,
      pot,
      display,
      columns: [
        { id: col1.id, label: 'Column 1', equipment: col1 },
        { id: col2.id, label: 'Column 2', equipment: col2 },
      ],
    });
  }

  for (const item of equipment) {
    if (item.equipment_type !== 'pot_still' && item.equipment_type !== 'column_still') continue;
    if (hiddenIds.has(item.id)) continue;
    if (displayIds.has(item.id)) continue;
    targets.push({ kind: 'single', equipment: item });
  }

  return targets.sort((a, b) => {
    const nameA = a.kind === 'train' ? a.display.name : a.equipment.name;
    const nameB = b.kind === 'train' ? b.display.name : b.equipment.name;
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
  const displayName = train?.display_equipment_id
    ? queryOne<{ name: string }>('SELECT name FROM floor_equipment WHERE id = ?', [train.display_equipment_id])?.name
    : null;
  const label = displayName ?? train?.label ?? run.still_name?.trim() ?? 'Still train';
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
