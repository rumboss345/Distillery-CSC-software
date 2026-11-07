import { Link } from 'react-router-dom';
import { Modal } from './Modal';
import type { StaffMessage } from '../lib/auth-api';
import { staffDisplayName } from '../hooks/useStaffMessageNotifications';

interface StaffMessagePopupProps {
  message: StaffMessage;
  onDismiss: () => void;
  onMarkRead: () => void;
}

export function StaffMessagePopup({ message, onDismiss, onMarkRead }: StaffMessagePopupProps) {
  const from = staffDisplayName(message.sender_name, message.sender_email);
  return (
    <Modal title="New staff message" onClose={onDismiss}>
      <p className="field-hint" style={{ marginTop: 0 }}>
        From <strong>{from}</strong>
      </p>
      <div className="staff-message-popup-body">{message.body}</div>
      <div className="form-actions" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onDismiss}>
          Dismiss
        </button>
        <button type="button" className="btn btn-secondary" onClick={onMarkRead}>
          Mark read
        </button>
        <Link to="/messages" className="btn btn-primary" onClick={onDismiss}>
          Open Messaging Center
        </Link>
      </div>
    </Modal>
  );
}
