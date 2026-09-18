import { useState } from 'react';
import { verifyAdminCredentials } from '../lib/auth-api';
import { Modal } from './Modal';

interface AdminCredentialConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirmed: () => void;
}

export function AdminCredentialConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  onClose,
  onConfirmed,
}: AdminCredentialConfirmModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyAdminCredentials(email.trim(), password);
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify administrator.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="field-hint" style={{ marginTop: 0 }}>{message}</p>
        <div className="form-group">
          <label htmlFor="admin-confirm-email">Administrator email</label>
          <input
            id="admin-confirm-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="admin-confirm-password">Administrator password</label>
          <input
            id="admin-confirm-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="auth-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={submitting}>
            {submitting ? 'Verifying…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
