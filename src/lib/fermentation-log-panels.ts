export interface FermenterLogAssignment {
  floor_equipment_id: number;
  equipment_name: string;
  volume_gal: number;
}

export interface FermentationLogSourceRef {
  floor_equipment_id: number | null;
  equipment_name: string;
}

export interface FermenterLogPanelSpec {
  equipmentId: number | null;
  equipmentName: string;
  volumeGal?: number;
  /** Logs stay visible but cannot be added. */
  readOnly: boolean;
  /** Fermenter was charged to a still, so the assignment is gone. */
  distilled: boolean;
}

export interface FermenterColumnTag {
  key: string;
  label: string;
  distilled: boolean;
}

/**
 * Current fermenter assignments, then any fermenters that still have logs after
 * they were charged to a still. An empty result becomes one unassigned panel so
 * a fermenting batch can still record a log.
 */
export function fermenterLogPanels(options: {
  batchComplete: boolean;
  assignments: FermenterLogAssignment[];
  logSources: FermentationLogSourceRef[];
}): FermenterLogPanelSpec[] {
  const panels: FermenterLogPanelSpec[] = options.assignments.map((assignment) => ({
    equipmentId: assignment.floor_equipment_id,
    equipmentName: assignment.equipment_name,
    volumeGal: assignment.volume_gal,
    readOnly: options.batchComplete,
    distilled: false,
  }));

  const assignedIds = new Set(options.assignments.map((assignment) => assignment.floor_equipment_id));

  for (const source of options.logSources) {
    if (source.floor_equipment_id != null && assignedIds.has(source.floor_equipment_id)) continue;
    if (source.floor_equipment_id == null) {
      if (panels.length === 0) continue;
      panels.push({
        equipmentId: null,
        equipmentName: source.equipment_name || 'Unassigned',
        readOnly: true,
        distilled: false,
      });
      continue;
    }
    panels.push({
      equipmentId: source.floor_equipment_id,
      equipmentName: source.equipment_name || `Fermenter ${source.floor_equipment_id}`,
      readOnly: true,
      distilled: true,
    });
  }

  if (panels.length === 0) {
    panels.push({
      equipmentId: null,
      equipmentName: '',
      readOnly: options.batchComplete,
      distilled: false,
    });
  }

  return panels;
}

/** Fermenter names for a wash row, including fermenters released after distillation. */
export function fermenterColumnTags(options: {
  assignments: (FermenterLogAssignment & { id: number })[];
  logSources: FermentationLogSourceRef[];
}): FermenterColumnTag[] {
  const tags: FermenterColumnTag[] = options.assignments.map((assignment) => ({
    key: `assign-${assignment.id}`,
    label: `${assignment.equipment_name}${assignment.volume_gal > 0 ? ` (${assignment.volume_gal} gal)` : ''}`,
    distilled: false,
  }));

  const assignedIds = new Set(options.assignments.map((assignment) => assignment.floor_equipment_id));
  for (const source of options.logSources) {
    if (source.floor_equipment_id == null) continue;
    if (assignedIds.has(source.floor_equipment_id)) continue;
    const name = source.equipment_name || `Fermenter ${source.floor_equipment_id}`;
    tags.push({
      key: `log-${source.floor_equipment_id}`,
      label: `${name} (distilled)`,
      distilled: true,
    });
  }

  return tags;
}
