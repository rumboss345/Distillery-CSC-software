import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Modal } from './Modal';
import { equipmentReturnState } from '../lib/equipment-return';
import {
  inOutAbvLabel,
  inOutDetailRows,
  inOutModalSubtitle,
  inOutMovementLinks,
} from '../lib/holding-tank-in-out-detail';
import type { HoldingTankInOutEntry } from '../types';

interface HoldingTankInOutDetailModalProps {
  entry: HoldingTankInOutEntry;
  tankName?: string;
  returnEquipmentId?: number | null;
  onClose: () => void;
}

export function HoldingTankInOutDetailModal({
  entry,
  tankName,
  returnEquipmentId,
  onClose,
}: HoldingTankInOutDetailModalProps) {
  const rows = inOutDetailRows(entry);
  const links = inOutMovementLinks(entry);
  const returnState = returnEquipmentId != null ? equipmentReturnState(returnEquipmentId) : undefined;
  const volumeSign = entry.direction === 'in' ? '+' : '−';

  return createPortal(
    <Modal
      title={entry.movement_label}
      onClose={onClose}
    >
      <p className="field-hint" style={{ marginTop: 0 }}>
        {inOutModalSubtitle(entry, tankName)}
      </p>
      <dl className="intake-view-list">
        {rows.map((row) => (
          <span key={row.label} style={{ display: 'contents' }}>
            <dt>{row.label}</dt>
            <dd>{row.label === 'Summary' ? <strong>{row.value}</strong> : row.value}</dd>
          </span>
        ))}
        <dt>Volume</dt>
        <dd>
          <strong>
            {volumeSign}
            {entry.volume_gal.toFixed(2)}
            {' '}
            gal
          </strong>
          {entry.abv > 0 ? ` · ${inOutAbvLabel(entry)}` : ''}
        </dd>
      </dl>
      {links.length > 0 && (
        <div className="intake-view-actions intake-view-actions--row">
          {links.map((link) => (
            <Link
              key={link.to}
              className="btn btn-sm btn-secondary"
              to={link.to}
              state={returnState}
              onClick={onClose}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </Modal>,
    document.body,
  );
}