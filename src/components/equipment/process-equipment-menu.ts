import { classifyProcessLiquid } from './process-floor-label';
import { FERMENTATION_READY_MAX_BRIX, isBrixReadyForDistillation } from '../../lib/fermentation';

export interface ProcessEquipmentMenuLink {
  key: string;
  label: string;
  to: string;
}

export interface ProcessEquipmentContextMenuModel {
  next: ProcessEquipmentMenuLink[];
  records: ProcessEquipmentMenuLink[];
  maintenance: ProcessEquipmentMenuLink;
  hint: string | null;
}

/** Fields the process canvas already has when the operator right-clicks a vessel. */
export interface ProcessEquipmentMenuSource {
  id: number;
  name: string;
  equipment_type: string;
  active_batch_number?: string;
  active_latest_brix?: number | null;
  active_mash_status?: string | null;
  linked_mash_batch_id?: number | null;
  volumeGal: number;
  abv: number | null;
  liquidName?: string | null;
  /** Open distillation run (running, or planned if nothing is running) on this still. */
  distillationRunId?: number | null;
}

export function buildProcessEquipmentContextMenu(
  source: ProcessEquipmentMenuSource,
): ProcessEquipmentContextMenuModel {
  const hasLiquid = source.volumeGal > 0;
  const isTransferVessel = source.equipment_type === 'holding_tank'
    || source.equipment_type === 'collection_vessel';
  const isHoldingTank = source.equipment_type === 'holding_tank';
  const liquidClass = classifyProcessLiquid(source.name, source.liquidName);
  const canProcessSpirit = isHoldingTank
    && hasLiquid
    && (source.abv ?? 0) > 0
    && liquidClass !== 'stillage'
    && liquidClass !== 'dunder';
  const canChargeFermenter = source.equipment_type === 'fermenter'
    && !!source.active_batch_number
    && hasLiquid;
  const canFermentWash = source.equipment_type === 'mash_tun'
    && source.active_mash_status === 'mashing'
    && source.linked_mash_batch_id != null;
  const isStill = source.equipment_type === 'pot_still' || source.equipment_type === 'column_still';

  const next: ProcessEquipmentMenuLink[] = [];
  if (canFermentWash) {
    next.push({
      key: 'ferment',
      label: 'Ferment',
      to: `/fermentation?wash=${source.linked_mash_batch_id}`,
    });
  }
  if (canChargeFermenter) {
    next.push(
      {
        key: 'low-wine',
        label: 'Low wine run',
        to: `/distillation?chargeFermenter=${source.id}&runType=wash`,
      },
      {
        key: 'heavy-rum',
        label: 'Heavy rum',
        to: `/distillation?chargeFermenter=${source.id}&runType=heavy_rum`,
      },
      {
        key: 'transfer',
        label: 'Transfer',
        to: `/tank-transfer?source=${source.id}`,
      },
    );
  }
  if (isTransferVessel && hasLiquid && !canChargeFermenter) {
    next.push({
      key: 'transfer',
      label: 'Transfer',
      to: `/tank-transfer?source=${source.id}`,
    });
  }
  if (canProcessSpirit) {
    next.push(
      {
        key: 'spirit-run',
        label: 'Spirit run',
        to: `/distillation?chargeTank=${source.id}`,
      },
      {
        key: 'blend',
        label: 'Blend',
        to: `/blending?tank=${source.id}`,
      },
      {
        key: 'bottle',
        label: 'Bottle',
        to: `/bottling?tank=${source.id}`,
      },
    );
  }

  const records: ProcessEquipmentMenuLink[] = [];
  if (canChargeFermenter) {
    const viewing = source.active_mash_status === 'complete';
    records.push({
      key: 'logs',
      label: viewing ? 'View logs' : 'Add logs',
      to: `/fermentation?logsEquipment=${source.id}`,
    });
  }
  if (isStill && source.distillationRunId) {
    records.push({
      key: 'cuts',
      label: 'Add cuts',
      to: `/distillation?cutsRun=${source.distillationRunId}`,
    });
  }

  const hint = canChargeFermenter
    && source.active_latest_brix != null
    && !isBrixReadyForDistillation(source.active_latest_brix)
    ? `Brix is ${source.active_latest_brix.toFixed(1)}°. Below ${FERMENTATION_READY_MAX_BRIX}° is recommended before charging.`
    : null;

  return {
    next,
    records,
    maintenance: {
      key: 'maintenance',
      label: 'Equipment Maintenance',
      to: `/equipment-maintenance?equipment=${source.id}`,
    },
    hint,
  };
}
