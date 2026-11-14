import { equipmentTypeLabel } from '../equipment';
import type { ProcessStageKey } from '../permissions';
import { laaGalFromVolumeAbv } from '../reporting/alcohol-units';

/** Equipment shown in Tank & Equipment Status. Pumps, hoses, and other fittings hold no liquid. */
export const STATUS_EQUIPMENT_TYPES = [
  'mash_tun',
  'fermenter',
  'pot_still',
  'column_still',
  'collection_vessel',
  'holding_tank',
  'stillage_tank',
] as const;

const STAGE_BY_TYPE: Record<string, ProcessStageKey> = {
  mash_tun: 'preparation',
  fermenter: 'fermentation',
  pot_still: 'distillation',
  column_still: 'distillation',
  boiler: 'distillation',
  collection_vessel: 'distillation',
  holding_tank: 'storage',
  stillage_tank: 'storage',
};

export function processStageForEquipmentType(type: string): ProcessStageKey {
  return STAGE_BY_TYPE[type] ?? 'other';
}

export interface TankStatusSource {
  id: number;
  name: string;
  equipment_type: string;
  status: string;
  capacity_gal: number;
  maintenance_status: string | null;
  /** Book volume from production records (transfers, cuts, draws), not a sensor reading. */
  volume_gal: number;
  abv: number | null;
  /** Contents label from records, e.g. "Hearts · 3 runs" or a blend product name. */
  contents: string;
  batch_number: string | null;
  mash_batch_id: number | null;
  mash_status: string | null;
  latest_brix: number | null;
  /** Running or planned distillation on this still. */
  still_run_status: 'running' | 'planned' | null;
  /** True when the tank holds a finished blend. */
  holds_blend: boolean;
  /** Last time someone set the tank volume by measurement (dip or sight glass). */
  last_measured_at: string | null;
}

export interface NextAction {
  label: string;
  href: string;
  tone: 'urgent' | 'normal' | 'idle';
}

export interface TankStatusRow {
  id: number;
  name: string;
  equipment_type: string;
  type_label: string;
  stage: ProcessStageKey;
  capacity_gal: number;
  book_volume_gal: number;
  fill_pct: number | null;
  abv: number | null;
  laa_gal: number;
  contents: string;
  batch_number: string | null;
  status_label: string;
  last_measured_at: string | null;
  next_action: NextAction;
}

function statusLabel(source: TankStatusSource): string {
  if (source.maintenance_status === 'broken') return 'Broken';
  if (source.maintenance_status === 'maintenance') return 'Maintenance';
  if (source.status === 'cleaning') return 'Needs cleaning';
  if (source.still_run_status === 'running') return 'Running';
  if (source.mash_status === 'fermenting') return 'Fermenting';
  if (source.mash_status === 'mashing') return 'Mashing';
  if (source.volume_gal > 0.05) return 'In use';
  if (source.still_run_status === 'planned') return 'Planned';
  return 'Empty';
}

/**
 * The next step for a vessel, worked out only from its records.
 * Fermenters below the ready Brix go to distillation; everything else follows its status.
 */
export function nextActionFor(source: TankStatusSource, readyMaxBrix: number): NextAction {
  const equipmentLink = `/equipment-maintenance?equipment=${source.id}`;
  if (source.maintenance_status === 'broken' || source.maintenance_status === 'maintenance') {
    return { label: 'Repair before use', href: equipmentLink, tone: 'urgent' };
  }
  if (source.status === 'cleaning') {
    return { label: 'Clean and mark clean', href: equipmentLink, tone: 'urgent' };
  }
  if (source.capacity_gal > 0 && source.volume_gal / source.capacity_gal > 1.005) {
    return { label: 'Check volume — over capacity', href: `/floor-plan?equipment=${source.id}`, tone: 'urgent' };
  }
  const type = source.equipment_type;
  if (type === 'fermenter' || type === 'mash_tun') {
    if (source.mash_batch_id && source.mash_status === 'fermenting') {
      const logs = `/fermentation?wash=${source.mash_batch_id}&logsEquipment=${source.id}`;
      if (source.latest_brix != null && source.latest_brix <= readyMaxBrix) {
        return { label: 'Ready to distil', href: '/distillation', tone: 'normal' };
      }
      return { label: 'Log Brix and temperature', href: logs, tone: 'normal' };
    }
    if (source.mash_batch_id && source.mash_status === 'mashing') {
      return { label: 'Finish wash and start fermentation', href: `/wash?record=${source.mash_batch_id}`, tone: 'normal' };
    }
    return { label: 'Available for a wash', href: '/wash', tone: 'idle' };
  }
  if (type === 'pot_still' || type === 'column_still') {
    if (source.still_run_status === 'running') {
      return { label: 'Record cuts and finish the run', href: '/distillation', tone: 'normal' };
    }
    if (source.still_run_status === 'planned') {
      return { label: 'Start the planned run', href: '/distillation', tone: 'normal' };
    }
    return { label: 'Available', href: '/distillation', tone: 'idle' };
  }
  if (source.volume_gal > 0.05) {
    if (type === 'stillage_tank') {
      return { label: 'Dump or send stillage', href: `/floor-plan?equipment=${source.id}`, tone: 'normal' };
    }
    if (source.holds_blend) {
      return { label: 'Bottle', href: `/bottling?tank=${source.id}`, tone: 'normal' };
    }
    if (type === 'collection_vessel') {
      return { label: 'Transfer or charge the still', href: '/tank-transfer', tone: 'normal' };
    }
    return { label: 'Blend, transfer, or fill barrels', href: `/blending?tank=${source.id}`, tone: 'normal' };
  }
  return { label: 'Available', href: `/floor-plan?equipment=${source.id}`, tone: 'idle' };
}

export function buildTankStatusRows(sources: TankStatusSource[], readyMaxBrix: number): TankStatusRow[] {
  return sources
    .filter((source) => (STATUS_EQUIPMENT_TYPES as readonly string[]).includes(source.equipment_type))
    .map((source) => {
      const fill = source.capacity_gal > 0 ? (source.volume_gal / source.capacity_gal) * 100 : null;
      return {
        id: source.id,
        name: source.name,
        equipment_type: source.equipment_type,
        type_label: equipmentTypeLabel(source.equipment_type),
        stage: processStageForEquipmentType(source.equipment_type),
        capacity_gal: source.capacity_gal,
        book_volume_gal: source.volume_gal,
        fill_pct: fill != null ? Math.round(fill * 10) / 10 : null,
        abv: source.abv,
        laa_gal: source.abv != null ? laaGalFromVolumeAbv(source.volume_gal, source.abv) : 0,
        contents: source.contents,
        batch_number: source.batch_number,
        status_label: statusLabel(source),
        last_measured_at: source.last_measured_at,
        next_action: nextActionFor(source, readyMaxBrix),
      };
    })
    .sort((a, b) => {
      const order = (STATUS_EQUIPMENT_TYPES as readonly string[]);
      const byType = order.indexOf(a.equipment_type) - order.indexOf(b.equipment_type);
      if (byType !== 0) return byType;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
}
