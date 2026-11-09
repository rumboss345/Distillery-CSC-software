import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Modal } from './Modal';
import { equipmentReturnState } from '../lib/equipment-return';
import { formatRecordedAt } from '../lib/date-input';
import { INTAKE_KIND_LABELS, intakeDetailRows } from '../lib/holding-tank-intake-detail';
import type { HoldingTankIntakeEntry } from '../types';

interface HoldingTankIntakeDetailModalProps {
  entry: HoldingTankIntakeEntry;
  tankName?: string;
  returnEquipmentId?: number | null;
  onClose: () => void;
}

export function HoldingTankIntakeDetailModal({
  entry,
  tankName,
  returnEquipmentId,
  onClose,
}: HoldingTankIntakeDetailModalProps) {
  const rows = intakeDetailRows(entry).filter((row) => row.label !== 'Recorded');
  const returnState = returnEquipmentId != null ? equipmentReturnState(returnEquipmentId) : undefined;

  return createPortal(
    <Modal
      title={`${INTAKE_KIND_LABELS[entry.kind]}`}
      onClose={onClose}
    >
      {tankName && (
        <p className="field-hint" style={{ marginTop: 0 }}>
          Into {tankName}
        </p>
      )}
      <dl className="intake-view-list">
        <dt>When</dt>
        <dd>{formatRecordedAt(entry.occurred_at)}</dd>
        {rows.map((row) => (
          <span key={row.label} style={{ display: 'contents' }}>
            <dt>{row.label}</dt>
            <dd>{row.label === 'Summary' ? <strong>{row.value}</strong> : row.value}</dd>
          </span>
        ))}
      </dl>
      <div className="intake-view-actions intake-view-actions--row">
        {entry.distillationRunId != null && (
          <Link
            className="btn btn-sm btn-primary"
            to={`/distillation?cutsRun=${entry.distillationRunId}`}
            state={returnState}
            onClick={onClose}
          >
            {entry.kind === 'stillage' ? 'View distillation run' : 'View run & cuts'}
          </Link>
        )}
        {entry.kind === 'blend' && (
          <Link
            className="btn btn-sm btn-secondary"
            to={`/blending?record=${entry.id}`}
            state={returnState}
            onClick={onClose}
          >
            Open blend batch
          </Link>
        )}
        {entry.kind === 'transfer' && entry.sourceTankId != null && (
          <Link
            className="btn btn-sm btn-secondary"
            to={`/floor-plan?equipment=${entry.sourceTankId}`}
            state={returnState}
            onClick={onClose}
          >
            View source tank
          </Link>
        )}
        {entry.kind === 'transfer' && (
          <Link
            className="btn btn-sm btn-ghost"
            to="/tank-transfer"
            state={returnState}
            onClick={onClose}
          >
            Tank transfer
          </Link>
        )}
      </div>
    </Modal>,
    document.body,
  );
}
