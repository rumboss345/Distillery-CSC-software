import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fetchRecentActivity, type ActivityEntry } from '../lib/auth-api';
import { ACTION_ASSIGNMENT_LABELS, type ActionAssignmentKey } from '../lib/permissions';

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentActivity(25)
      .then(({ activity }) => setItems(activity))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-muted">Loading recent activity…</p>;
  }

  if (items.length === 0) {
    return <p className="text-muted">No recorded activity yet. Actions will appear here when users save work.</p>;
  }

  return (
    <ul className="activity-feed">
      {items.map((item) => {
        const label =
          ACTION_ASSIGNMENT_LABELS[item.action_key as ActionAssignmentKey] ?? item.action_key;
        return (
          <li key={item.id} className="activity-feed-item">
            <span className="activity-feed-time">
              {format(new Date(item.created_at), 'MMM d, h:mm a')}
            </span>
            <span className="activity-feed-user">{item.user_name || item.user_email}</span>
            <span className="activity-feed-action">{label}</span>
            <span className="activity-feed-desc">{item.description}</span>
          </li>
        );
      })}
    </ul>
  );
}
