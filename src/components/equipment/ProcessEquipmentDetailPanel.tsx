import { useEffect, useState } from 'react';
import { HoldingTankIntakeHistory } from '../HoldingTankIntakeHistory';
import { StatusBadge } from '../StatusBadge';
import { holdingTankIntakeKey } from '../../db/queries';
import { STATUS_LABELS, formatGal } from './equipment-visual-shared';
import type { EquipmentVisualData } from './equipment-visual.types';
import type { FloorEquipmentView } from '../../types';

interface ProcessEquipmentDetailPanelProps {
  equipment: FloorEquipmentView | null;
  visual: EquipmentVisualData | null;
  planName: string;
  onEdit?: () => void;
  onRemove?: () => void;
}

export function ProcessEquipmentDetailPanel({
  equipment,
  visual,
  planName,
  onEdit,
  onRemove,
}: ProcessEquipmentDetailPanelProps) {
  const [selectedIntakeKey, setSelectedIntakeKey] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIntakeKey(null);
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

  return (
    <div className="process-panel card process-panel--detail">
      <h4 className="process-panel-title">{visual.name}</h4>
      <p className="process-equipment-detail-code">{visual.code} · {visual.typeLabel}</p>
      <dl className="process-equipment-detail-list">
        <dt>Status</dt>
        <dd><StatusBadge status={statusLabel} /></dd>
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
