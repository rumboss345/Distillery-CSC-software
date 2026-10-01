import { Link } from 'react-router-dom';
import { RECENT_COMPLETED_LIMIT } from '../lib/recent-completed';

export function RecentCompletedNote({
  hiddenCount,
  to,
  label = 'completed',
}: {
  hiddenCount: number;
  to: string;
  label?: string;
}) {
  if (hiddenCount <= 0) return null;
  return (
    <p className="field-hint" style={{ margin: '0.35rem 0 0.75rem' }}>
      Showing the last {RECENT_COMPLETED_LIMIT} {label}.
      {' '}Older records are on <Link to={to}>Reports</Link>.
    </p>
  );
}
