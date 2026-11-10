import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { equipmentReturnState } from '../../lib/equipment-return';
import { HoldingTankIntakeHistory } from '../HoldingTankIntakeHistory';
import { HoldingTankIntakeDetailModal } from '../HoldingTankIntakeDetailModal';
import { StatusBadge } from '../StatusBadge';
import { AssigneeSelect } from '../AssigneeSelect';
import {
  completeFermenterAssignment,
  getActiveBottlingRunOnEquipment,
  getDistillationRunForCuts,
  getDistillationRuns,
  getHoldingTankVolumeVariances,
  holdingTankIntakeKey,
  markEquipmentCleaned,
  saveDistillationRun,
} from '../../db/queries';
import { isBottlingLineEquipment } from '../../lib/bottling-equipment';
import { buildProcessEquipmentContextMenu } from './process-equipment-menu';
import { formatTankVolumeVariance, tankVolumeMatchesRecord } from '../../lib/tank-volume-variance';
import { STATUS_LABELS, formatGal } from './equipment-visual-shared';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { FloorEquipmentView, HoldingTankIntakeEntry } from '../../types';
import {
  equipmentCleaningDaysDirty,
  equipmentCleaningOverdueFlash,
  equipmentCleaningStatusLabel,
  equipmentNeedsCleaning,
} from '../../lib/equipment-cleaning';
import { getCleaningFlaggedAtByEquipmentId } from '../../db/queries';
import {
  equipmentBlocksProduction,
  maintenanceStatusLabel,
} from '../../lib/equipment-maintenance';
import { formatDateDisplay, formatRecordedAt } from '../../lib/date-input';
import { FERMENTATION_READY_MAX_BRIX, fermentationDaysOverdue, formatDaysOverdue, isBrixReadyForDistillation } from '../../lib/fermentation';
import { stillageTankNeedsDump } from '../../lib/stillage';
import { localIsoDate } from '../../lib/planned-event-date';
import type { AssignedEmployee } from '../../lib/assignee';

interface ProcessEquipmentDetailPanelProps {
  equipment: FloorEquipmentView | null;
  visual: EquipmentVisualData | null;
  planName: string;
  onEdit?: () => void;
  onRemove?: () => void;
  onEquipmentUpdated?: () => void;
}

export function ProcessEquipmentDetailPanel({
  equipment,
  visual,
  planName,
  onEdit,
  onRemove,
  onEquipmentUpdated,
}: ProcessEquipmentDetailPanelProps) {
  const [selectedIntakeKey, setSelectedIntakeKey] = useState<string | null>(null);
  const [viewedIntake, setViewedIntake] = useState<HoldingTankIntakeEntry | null>(null);
  const [cleanedBy, setCleanedBy] = useState<AssignedEmployee>({
    assigned_user_id: null,
    assigned_user_name: null,
  });

  useEffect(() => {
    setSelectedIntakeKey(null);
    setViewedIntake(null);
    setCleanedBy({ assigned_user_id: null, assigned_user_name: null });
  }, [equipment?.id]);

  if (!equipment || !visual) {
    return (
      <div className="process-panel process-panel--detail">
        <h4 className="process-panel-title">Selected equipment</h4>
        <p className="process-panel-empty">
          Select a tank, fermenter, or still on the canvas to see fill level, proof, and activity.
        </p>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[visual.status] ?? equipment.status.replace('_', ' ');
  const dirty = equipmentNeedsCleaning(equipment);
  const cleaningDaysDirty = dirty
    ? equipmentCleaningDaysDirty(getCleaningFlaggedAtByEquipmentId().get(equipment.id), localIsoDate())
    : 0;
  const cleaningOverdue = equipmentCleaningOverdueFlash(cleaningDaysDirty);
  const stillageNeedsDump = stillageTankNeedsDump({
    equipmentType: equipment.equipment_type,
    volumeGal: visual.currentVolumeGal,
    capacityGal: visual.capacityGal,
    fillPercent: visual.fillPercent,
  });
  const hasLiquid = visual.currentVolumeGal > 0;
  const isVolumeTank = equipment.equipment_type === 'holding_tank'
    || equipment.equipment_type === 'stillage_tank'
    || equipment.equipment_type === 'collection_vessel';
  const latestVolumeVariance = isVolumeTank
    ? getHoldingTankVolumeVariances().find((row) => row.tank_equipment_id === equipment.id) ?? null
    : null;
  const canChargeFermenter = equipment.equipment_type === 'fermenter'
    && !!equipment.active_batch_number
    && hasLiquid;
  const brixNotReady = canChargeFermenter
    && equipment.active_latest_brix != null
    && !isBrixReadyForDistillation(equipment.active_latest_brix);

  const isStill = equipment.equipment_type === 'pot_still' || equipment.equipment_type === 'column_still';
  const stillRun = isStill ? getDistillationRunForCuts(equipment.name) ?? null : null;
  const bottlingRun = isBottlingLineEquipment(equipment)
    ? getActiveBottlingRunOnEquipment(equipment.id) ?? null
    : null;
  const fermenting = equipment.equipment_type === 'fermenter' && equipment.active_mash_status === 'fermenting';
  const daysOverdue = equipment.equipment_type === 'fermenter'
    ? fermentationDaysOverdue(equipment.active_mash_status, equipment.active_expected_completion_date, localIsoDate())
    : 0;
  const distilling = stillRun?.status === 'running';
  const bottling = bottlingRun?.status === 'running';
  const nextMenu = buildProcessEquipmentContextMenu({
    id: equipment.id,
    name: equipment.name,
    equipment_type: equipment.equipment_type,
    active_batch_number: equipment.active_batch_number,
    active_latest_brix: equipment.active_latest_brix,
    active_mash_status: equipment.active_mash_status,
    linked_mash_batch_id: equipment.linked_mash_batch_id,
    volumeGal: visual.currentVolumeGal,
    abv: visual.abv ?? equipment.active_abv ?? null,
    liquidName: visual.liquidName,
    distillationRunId: stillRun?.id ?? null,
    distillationRunStatus: stillRun?.status ?? null,
    icon: equipment.icon,
    bottlingRunId: bottlingRun?.id ?? null,
    bottlingRunStatus: bottlingRun?.status ?? null,
  });
  const showNextStep = nextMenu.next.length > 0 || fermenting || distilling || bottling;

  const handleMarkComplete = () => {
    try {
      if (fermenting) {
        if (!confirm(`Mark the fermentation in ${equipment.name} complete?`)) return;
        completeFermenterAssignment(equipment.id);
      } else if (distilling && stillRun) {
        const run = getDistillationRuns().find((item) => item.id === stillRun.id);
        if (!run) throw new Error('Distillation run not found.');
        if (!confirm(`Mark ${run.batch_number} on ${equipment.name} complete?`)) return;
        saveDistillationRun({ ...run, status: 'complete' }, run.id);
      }
      onEquipmentUpdated?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not mark this complete.');
    }
  };

  const handleMarkCleaned = () => {
    if (!cleanedBy.assigned_user_id) {
      alert('Select who cleaned this equipment.');
      return;
    }
    try {
      markEquipmentCleaned(
        equipment.id,
        cleanedBy.assigned_user_id,
        cleanedBy.assigned_user_name ?? '',
      );
      onEquipmentUpdated?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not mark equipment clean.');
    }
  };

  return (
    <div className="process-panel process-panel--detail">
      <h4 className="process-panel-title">{visual.name}</h4>
      <p className="process-equipment-detail-code">{visual.code} · {visual.typeLabel}</p>

      {(hasLiquid || visual.liquidName) && (
        <div className="process-contents-card" data-testid="process-tank-contents">
          <div className="process-contents-kicker">In this tank</div>
          <strong>{visual.liquidName || (visual.isFermenting ? 'Fermenting wash' : equipment.name)}</strong>
          <p>
            {formatGal(visual.currentVolumeGal)} gal
            {visual.estimatedAbv != null ? ` · est. ${visual.estimatedAbv.toFixed(1)}% ABV` : ''}
            {visual.estimatedAbv == null && visual.abv != null && visual.abv > 0 ? ` · ${visual.abv.toFixed(1)}% ABV` : ''}
            {visual.capacityGal > 0 ? ` · ${Math.round(visual.fillPercent)}% full` : ''}
          </p>
          <p className="field-hint" style={{ marginTop: '0.5rem' }}>
            Names follow blend batches and intakes in this tank. After blending, execute the batch into the tank that should carry the product name.
          </p>
        </div>
      )}

      {stillageNeedsDump && (
        <div
          className="process-equipment-cleaning-banner process-equipment-cleaning-banner--overdue process-equipment-stillage-dump-banner"
          role="status"
          data-testid="stillage-dump-banner"
        >
          <strong>Stillage over 75% full — dump or transfer out</strong>
          <p className="field-hint" style={{ margin: '0.35rem 0 0' }}>
            Use{' '}
            <Link to="/tank-transfer" state={equipmentReturnState(equipment.id)}>Tank transfer</Link>
            {' '}to move stillage or discard it before the next run fills this tank.
          </p>
        </div>
      )}

      {dirty && (
        <div
          className={`process-equipment-cleaning-banner${cleaningOverdue ? ' process-equipment-cleaning-banner--overdue' : ''}`}
          role="status"
        >
          <strong>
            {equipmentCleaningStatusLabel()}
            {cleaningOverdue ? ` (${cleaningDaysDirty} days — clean now)` : ''}
          </strong>
          <p className="field-hint" style={{ margin: '0.35rem 0 0' }}>
            Mark clean before the next batch, here or on{' '}
            <Link to={`/equipment-maintenance?equipment=${equipment.id}`} state={equipmentReturnState(equipment.id)}>Equipment Maintenance</Link>.
          </p>
        </div>
      )}

      <dl className="process-equipment-detail-list">
        <dt>Status</dt>
        <dd><StatusBadge status={statusLabel} /></dd>

        {visual.capacityGal > 0 && (
          <>
            <dt>Fill</dt>
            <dd>
              {formatGal(visual.currentVolumeGal)} / {formatGal(visual.capacityGal)} gal
              {' '}({Math.round(visual.fillPercent)}%)
            </dd>
          </>
        )}

        {visual.liquidName && (
          <>
            <dt>Contents</dt>
            <dd>{visual.liquidName}</dd>
          </>
        )}

        {visual.estimatedAbv !== undefined && (
          <>
            <dt>Est. ABV</dt>
            <dd>{visual.estimatedAbv != null ? `${visual.estimatedAbv.toFixed(1)}%` : '—'}</dd>
          </>
        )}

        {visual.estimatedAbv === undefined && visual.abv != null && visual.abv > 0 && (
          <>
            <dt>Proof</dt>
            <dd>{visual.abv.toFixed(1)}% ABV</dd>
          </>
        )}

        {latestVolumeVariance && !tankVolumeMatchesRecord(latestVolumeVariance.variance_gal) && (
          <>
            <dt>Volume variance</dt>
            <dd>
              {formatTankVolumeVariance(latestVolumeVariance.variance_gal)}
              {' · '}
              {formatRecordedAt(latestVolumeVariance.recorded_at)}
              {latestVolumeVariance.notes ? ` · ${latestVolumeVariance.notes}` : ''}
            </dd>
          </>
        )}

        {equipment.equipment_type === 'fermenter' && equipment.active_batch_number && (
          <>
            <dt>Wash</dt>
            <dd>
              {equipment.active_batch_number}
              {equipment.active_volume_gal ? ` · ${equipment.active_volume_gal} gal` : ''}
              {equipment.active_latest_brix != null ? ` · ${equipment.active_latest_brix.toFixed(1)}° Brix` : ''}
            </dd>
          </>
        )}

        {equipment.equipment_type === 'fermenter' && equipment.active_batch_number && equipment.active_expected_completion_date && (
          <>
            <dt>Expected done</dt>
            <dd>
              {formatDateDisplay(equipment.active_expected_completion_date)}
              {daysOverdue > 0 && (
                <> <span className="badge badge-overdue" data-testid="panel-overdue">{formatDaysOverdue(daysOverdue)}</span></>
              )}
            </dd>
          </>
        )}

        {(equipment.equipment_type === 'fermenter' && visual.isFermenting) || (visual.detail && visual.detail !== visual.liquidName) ? (
          <>
            <dt>Activity</dt>
            <dd>
              {[
                equipment.equipment_type === 'fermenter' && visual.isFermenting ? 'Fermenting' : null,
                visual.detail && visual.detail !== visual.liquidName ? visual.detail : null,
              ].filter(Boolean).join(' · ')}
            </dd>
          </>
        ) : null}

        {equipment.maintenance_status && (
          <>
            <dt>Maintenance</dt>
            <dd>
              {maintenanceStatusLabel(equipment.maintenance_status)}
              {equipmentBlocksProduction(equipment) ? ' — blocked' : ''}
              {equipment.maintenance_notes ? (
                <>
                  <br />
                  <span className="process-equipment-detail-note">{equipment.maintenance_notes}</span>
                </>
              ) : null}
            </dd>
          </>
        )}

        {equipment.cleaned_at && !dirty && (
          <>
            <dt>Last cleaned</dt>
            <dd>
              {equipment.cleaned_by_user_name || '—'}
              {' · '}
              {formatRecordedAt(equipment.cleaned_at)}
            </dd>
          </>
        )}

        {planName ? (
          <>
            <dt>Floor page</dt>
            <dd>{planName}</dd>
          </>
        ) : null}

        {equipment.notes ? (
          <>
            <dt>Notes</dt>
            <dd>{equipment.notes}</dd>
          </>
        ) : null}
      </dl>

      {showNextStep && (
        <div className="process-next-actions">
          <div className="process-next-actions-label">Next step</div>
          {brixNotReady && (
            <p className="process-next-hint">
              Brix is {equipment.active_latest_brix?.toFixed(1)}°. Below {FERMENTATION_READY_MAX_BRIX}° is recommended before charging.
            </p>
          )}
          <div className="process-next-actions-row">
            {nextMenu.next.map((action) => (
              <Link
                key={action.key}
                className="btn btn-sm btn-secondary"
                to={action.to}
                state={equipmentReturnState(equipment.id)}
              >
                {action.label}
              </Link>
            ))}
            {(fermenting || distilling) && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={handleMarkComplete}>
                Mark complete
              </button>
            )}
          </div>
        </div>
      )}

      {dirty && (
        <div className="process-equipment-cleaning-form">
          <label htmlFor="equipment-cleaned-by">Cleaned by</label>
          <AssigneeSelect
            id="equipment-cleaned-by"
            value={cleanedBy}
            onChange={setCleanedBy}
            required
          />
          <button type="button" className="btn btn-sm btn-secondary" onClick={handleMarkCleaned}>
            Mark as cleaned
          </button>
        </div>
      )}

      {(equipment.equipment_type === 'holding_tank' || equipment.equipment_type === 'stillage_tank' || equipment.equipment_type === 'collection_vessel') && (
        <HoldingTankIntakeHistory
          tankId={equipment.id}
          limit={12}
          selectedKey={selectedIntakeKey}
          title="Intake history"
          hint="Click an entry for batch, cut, proof gallons, and links."
          emptyMessage="No cuts or transfers into this tank yet."
          onSelect={(entry) => {
            setSelectedIntakeKey(holdingTankIntakeKey(entry));
            setViewedIntake(entry);
          }}
        />
      )}

      {viewedIntake && (
        <HoldingTankIntakeDetailModal
          entry={viewedIntake}
          tankName={equipment.name}
          returnEquipmentId={equipment.id}
          onClose={() => setViewedIntake(null)}
        />
      )}

      {(onEdit || onRemove) && (
        <div className="process-detail-actions">
          {onEdit && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={onEdit}>
              Edit
            </button>
          )}
          {onRemove && (
            <button type="button" className="btn btn-sm btn-danger" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
