import { staffMessageReadReceiptStatus, staffMessageReadReceiptTitle } from '../lib/staff-message-read-receipt';

function formatReadWhen(iso: string): string {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function StaffMessageReadReceipt({
  readAt,
  compact = false,
}: {
  readAt: string | null | undefined;
  compact?: boolean;
}) {
  const status = staffMessageReadReceiptStatus(readAt);
  const title = staffMessageReadReceiptTitle(readAt);
  if (compact) {
    return (
      <span
        className={`staff-message-receipt staff-message-receipt--${status}`}
        title={readAt ? `${title} · ${formatReadWhen(readAt)}` : title}
        aria-label={readAt ? `Read ${formatReadWhen(readAt)}` : 'Sent, not read yet'}
      >
        <span className="staff-message-receipt-check" aria-hidden>
          {status === 'read' ? '✓✓' : '✓'}
        </span>
      </span>
    );
  }
  return (
    <p className={`staff-message-receipt staff-message-receipt--${status}`} title={title}>
      <span className="staff-message-receipt-check" aria-hidden>
        {status === 'read' ? '✓✓' : '✓'}
      </span>
      <span className="staff-message-receipt-label">
        {status === 'read' ? `Read ${formatReadWhen(readAt!)}` : 'Sent — waiting to be read'}
      </span>
    </p>
  );
}