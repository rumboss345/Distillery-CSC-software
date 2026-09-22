import { useEffect, useState } from 'react';
import { HoldingTankIntakeHistory } from '../HoldingTankIntakeHistory';
import { StatusBadge } from '../StatusBadge';
import { AssigneeSelect } from '../AssigneeSelect';
import { holdingTankIntakeKey, markEquipmentCleaned } from '../../db/queries';
import { STATUS_LABELS, formatGal } from './equipment-visual-shared';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { FloorEquipmentView } from '../../types';
import { equipmentCleaningStatusLabel, equipmentNeedsCleaning } from '../../lib/equipment-cleaning';
import {
  equipmentBlocksProduction,
  maintenanceStatusLabel,
} from '../../lib/equipment-maintenance';
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
      <div className="process-panel card process-panel--detail">
        <h4 className="process-panel-title">Equipment details</h4>
        <p className="process-panel-empty">Click a tank or other equipment on the canvas to see volume, proof, and activity.</p>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[visual.status] ?? equipment.status.replace('_', ' ');
  const dirty = equipmentNeedsCleaning(equipment);

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
    <div className="process-panel card process-panel--detail">
      <h4 className="process-panel-title">{visual.name}</h4>
      <p className="process-equipment-detail-code">{visual.code} · {visual.typeLabel}</p>
      {dirty && (
        <div className="process-equipment-cleaning-banner" role="status">
          <strong>{equipmentCleaningStatusLabel()}</strong>
          <p className="field-hint" style={{ margin: '0.35rem 0 0' }}>
            This unit was emptied after use. Mark it clean before charging the next batch.
          </p>
        </div>
      )}
      <dl className="process-equipment-detail-list">
        <dt>Status</dt>
        <dd><StatusBadge status={statusLabel} /></dd>
        {equipment.maintenance_status && (
          <>
            <dt>Maintenance</dt>
            <dd>
              {maintenanceStatusLabel(equipment.maintenance_status)}
              {equipmentBlocksProduction(equipment) ? ' — not available for production' : ''}
            </dd>
          </>
        )}
        {equipment.cleaned_at && (
          <>
            <dt>Last cleaned</dt>
            <dd>
              {equipment.cleaned_by_user_name || '—'}
              {' · '}
              {new Date(equipment.cleaned_at).toLocaleString()}
            </dd>
          </>
        )}
        {equipment.maintenance_notes && (
          <>
            <dt>Repair notes</dt>
            <dd>{equipment.maintenance_notes}</dd>
          </>
        )}
        <dt>Page</dt>
        <dd>{planName || '—'}</dd>
        {visual.capacityGal > 0 && (
          <>
            <dt>Fill level</dt>
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
            <dt>Wash batch</dt>
            <dd>
              {equipment.active_batch_number}
              {equipment.active_volume_gal ? ` · ${equipment.active_volume_gal} gal` : ''}
            </dd>
          </>
        )}
        {equipment.equipment_type === 'fermenter' && equipment.active_latest_brix != null && (
          <>
            <dt>Latest Brix</dt>
            <dd>{equipment.active_latest_brix.toFixed(1)}°</dd>
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
        {equipment.notes && (
          <>
            <dt>Notes</dt>
            <dd>{equipment.notes}</dd>
          </>
        )}
      </dl>
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
          title="Where it came from"
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
              Edit equipment
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
