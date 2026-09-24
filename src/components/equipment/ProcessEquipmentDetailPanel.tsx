import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HoldingTankIntakeHistory } from '../HoldingTankIntakeHistory';
import { StatusBadge } from '../StatusBadge';
import { AssigneeSelect } from '../AssigneeSelect';
import { holdingTankIntakeKey, markEquipmentCleaned } from '../../db/queries';
import { STATUS_LABELS, formatGal } from './equipment-visual-shared';
import { classifyProcessLiquid } from './process-floor-label';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { FloorEquipmentView } from '../../types';
import { equipmentCleaningStatusLabel, equipmentNeedsCleaning } from '../../lib/equipment-cleaning';
import {
  equipmentBlocksProduction,
  maintenanceStatusLabel,
} from '../../lib/equipment-maintenance';
import { FERMENTATION_READY_MAX_BRIX, isBrixReadyForDistillation } from '../../lib/fermentation';
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
  const [cleanedBy, setCleanedBy] = useState<AssignedEmployee>({
    assigned_user_id: null,
    assigned_user_name: null,
  });

  useEffect(() => {
    setSelectedIntakeKey(null);
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
  const hasLiquid = visual.currentVolumeGal > 0;
  const isTransferVessel = equipment.equipment_type === 'holding_tank'
    || equipment.equipment_type === 'collection_vessel';
  const isHoldingTank = equipment.equipment_type === 'holding_tank';
  const liquidClass = classifyProcessLiquid(visual.name, visual.liquidName);
  const canProcessSpirit = isHoldingTank
    && hasLiquid
    && (visual.abv ?? 0) > 0
    && liquidClass !== 'stillage'
    && liquidClass !== 'dunder';
  const canChargeFermenter = equipment.equipment_type === 'fermenter'
    && !!equipment.active_batch_number
    && hasLiquid;
  const brixNotReady = canChargeFermenter
    && equipment.active_latest_brix != null
    && !isBrixReadyForDistillation(equipment.active_latest_brix);

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

      {dirty && (
        <div className="process-equipment-cleaning-banner" role="status">
          <strong>{equipmentCleaningStatusLabel()}</strong>
          <p className="field-hint" style={{ margin: '0.35rem 0 0' }}>
            Mark clean before the next batch. Full maintenance history lives on{' '}
            <Link to="/equipment-maintenance">Equipment Maintenance</Link>.
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
              {new Date(equipment.cleaned_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
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

      {(canChargeFermenter || (isTransferVessel && hasLiquid)) && (
        <div className="process-next-actions">
          <div className="process-next-actions-label">Next step</div>
          {brixNotReady && (
            <p className="process-next-hint">
              Brix is {equipment.active_latest_brix?.toFixed(1)}°. Below {FERMENTATION_READY_MAX_BRIX}° is recommended before charging.
            </p>
          )}
          <div className="process-next-actions-row">
            {canChargeFermenter && (
              <>
                <Link className="btn btn-sm btn-primary" to={`/distillation?chargeFermenter=${equipment.id}&runType=wash`}>
                  Low wine run
                </Link>
                <Link className="btn btn-sm btn-secondary" to={`/distillation?chargeFermenter=${equipment.id}&runType=heavy_rum`}>
                  Heavy rum
                </Link>
              </>
            )}
            {isTransferVessel && hasLiquid && (
              <Link className="btn btn-sm btn-primary" to={`/tank-transfer?source=${equipment.id}`}>
                Transfer
              </Link>
            )}
            {canProcessSpirit && (
              <>
                <Link className="btn btn-sm btn-secondary" to={`/distillation?chargeTank=${equipment.id}`}>
                  Spirit run
                </Link>
                <Link className="btn btn-sm btn-secondary" to={`/blending?tank=${equipment.id}`}>
                  Blend
                </Link>
                <Link className="btn btn-sm btn-secondary" to={`/bottling?tank=${equipment.id}`}>
                  Bottle
                </Link>
              </>
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
          <button type="button" className="btn btn-sm btn-primary" onClick={handleMarkCleaned}>
            Mark as cleaned
          </button>
        </div>
      )}

      {(equipment.equipment_type === 'holding_tank' || equipment.equipment_type === 'collection_vessel') && (
        <HoldingTankIntakeHistory
          tankId={equipment.id}
          selectedKey={selectedIntakeKey}
          title="Intake history"
          hint={false}
          emptyMessage="No cuts or transfers into this tank yet."
          onSelect={(entry) => {
            setSelectedIntakeKey(
              selectedIntakeKey === holdingTankIntakeKey(entry)
                ? null
                : holdingTankIntakeKey(entry),
            );
          }}
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
