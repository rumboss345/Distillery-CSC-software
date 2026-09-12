import type { ActionAssignmentKey } from '../lib/permissions';
import { ACTION_ASSIGNMENT_LABELS } from '../lib/permissions';
import { useActionAssignments } from '../hooks/useActionAssignments';

interface AssignedUsersBarProps {
  actionKey: ActionAssignmentKey;
  refreshKey?: number;
}

export function AssignedUsersBar({ actionKey, refreshKey = 0 }: AssignedUsersBarProps) {
  const assignments = useActionAssignments(refreshKey);
  const users = assignments[actionKey] ?? [];

  if (users.length === 0) return null;

  const names = users.map((u) => u.name || u.email).join(', ');

  return (
    <div className="assigned-users-bar">
      <span className="assigned-users-bar-label">{ACTION_ASSIGNMENT_LABELS[actionKey]}:</span>
      <span className="assigned-users-bar-names">{names}</span>
    </div>
  );
}
