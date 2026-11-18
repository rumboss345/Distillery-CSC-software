import type { StaffMessage } from '../lib/auth-api';
import { staffDisplayName } from '../hooks/useStaffMessageNotifications';

function formatWhen(iso: string): string {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export interface StaffMessageParentQuoteProps {
  message: StaffMessage;
  compact?: boolean;
  onViewOriginal?: (parentId: number) => void;
}

export function StaffMessageParentQuote({
  message,
  compact = false,
  onViewOriginal,
}: StaffMessageParentQuoteProps) {
  if (!message.parent_id || !message.parent_body) return null;
  const from = staffDisplayName(message.parent_sender_name, message.parent_sender_email ?? '');
  const snippet =
    message.parent_body.length > (compact ? 100 : 200)
      ? `${message.parent_body.slice(0, compact ? 100 : 200)}…`
      : message.parent_body;
  return (
    <div className={`staff-message-parent-quote${compact ? ' compact' : ''}`}>
      <div className="staff-message-parent-quote-label">In reply to</div>
      <p className="staff-message-parent-quote-meta">
        <strong>{from}</strong>
        {message.parent_created_at ? ` · ${formatWhen(message.parent_created_at)}` : ''}
      </p>
      <p className="staff-message-parent-quote-body">{snippet}</p>
      {onViewOriginal && (
        <button
          type="button"
          className="btn btn-sm btn-ghost staff-message-parent-quote-link"
          onClick={() => onViewOriginal(message.parent_id!)}
        >
          View original message
        </button>
      )}
    </div>
  );
}