export type ReportSourceKind =
  | 'wash'
  | 'fermentation'
  | 'fermentation_logs'
  | 'distillation'
  | 'blend'
  | 'bottling';

export interface ReportSourceTarget {
  kind: ReportSourceKind;
  id: number;
  equipmentId?: number;
}

/** Deep link into the production page for a report row. */
export function reportSourcePath(target: ReportSourceTarget): string {
  switch (target.kind) {
    case 'wash':
      return `/wash?record=${target.id}`;
    case 'fermentation':
      return `/fermentation?wash=${target.id}`;
    case 'fermentation_logs':
      return target.equipmentId
        ? `/fermentation?wash=${target.id}&logsEquipment=${target.equipmentId}`
        : `/fermentation?wash=${target.id}`;
    case 'distillation':
      return `/distillation?record=${target.id}`;
    case 'blend':
      return `/blending?record=${target.id}`;
    case 'bottling':
      return `/bottling?record=${target.id}`;
    default:
      return '/';
  }
}
