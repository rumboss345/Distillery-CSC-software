import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../Modal';
import {
  ACTIVATE_LEDGER_CONFIRM_TEXT,
  validateActivationForm,
} from '../../../shared/material-inventory/ledger-activation-ui';

type Props = {
  materialName: string;
  onClose: () => void;
  onConfirm: (reference: string) => void;
};

export function ActivateLedgerDialog({ materialName, onClose, onConfirm }: Props) {
  const [reference, setReference] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const validationError = validateActivationForm({
      reference,
      confirmText,
      requireTypedConfirm: true,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    onConfirm(reference.trim());
  };

  return (
    <Modal title={`Activate Ledger — ${materialName}`} onClose={onClose}>
      <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
        Activating ledger tracking does <strong>not</strong> import or copy existing legacy inventory
        quantities. Ledger inventory will begin at zero until opening balances or new receipts are posted.
      </div>
      <div className="form-group">
        <label>Activation reference *</label>
        <input
          className="form-control"
          placeholder="e.g. Physical count 2026-09-11, Inventory migration"
          value={reference}
          onChange={(e) => { setReference(e.target.value); setError(''); }}
        />
      </div>
      <div className="form-group">
        <label>Type <code>{ACTIVATE_LEDGER_CONFIRM_TEXT}</code> to confirm *</label>
        <input
          className="form-control"
          value={confirmText}
          onChange={(e) => { setConfirmText(e.target.value); setError(''); }}
          autoComplete="off"
        />
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm}>Activate Ledger Tracking</button>
      </div>
    </Modal>
  );
}

type PostActivationBannerProps = {
  materialName: string;
  onDismiss: () => void;
};

export function PostActivationBanner({ materialName, onDismiss }: PostActivationBannerProps) {
  return (
    <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
      <strong>{materialName}</strong> — ledger tracking is active. Establish opening balances for existing
      physical stock before posting production issues or receipts that affect inventory.
      {' '}
      <Link to="/material-inventory/opening-balance">Post Opening Balance</Link>
      {' · '}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
