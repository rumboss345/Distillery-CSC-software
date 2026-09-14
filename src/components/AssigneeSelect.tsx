import { formatAssigneeLabel, resolveAssigneeOnChange, type AssignedEmployee } from '../lib/assignee';
import { useAssignableUsers } from '../hooks/useAssignableUsers';

interface AssigneeSelectProps {
  id?: string;
  value: AssignedEmployee;
  onChange: (next: AssignedEmployee) => void;
  required?: boolean;
  disabled?: boolean;
}

export function AssigneeSelect({
  id,
  value,
  onChange,
  required = false,
  disabled = false,
}: AssigneeSelectProps) {
  const { users, loading } = useAssignableUsers();
  const selectedId = value.assigned_user_id ?? '';
  const hasCurrentOption = !value.assigned_user_id
    || users.some((user) => user.id === value.assigned_user_id);

  return (
    <select
      id={id}
      value={selectedId}
      disabled={disabled || loading}
      required={required}
      onChange={(e) => {
        const nextId = e.target.value ? Number(e.target.value) : null;
        onChange(resolveAssigneeOnChange(nextId, users));
      }}
    >
      <option value="">{required ? '— Select employee —' : '— Unassigned —'}</option>
      {!hasCurrentOption && value.assigned_user_id && (
        <option value={value.assigned_user_id}>
          {formatAssigneeLabel(value.assigned_user_name)}
        </option>
      )}
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {formatAssigneeLabel(user.name, user.email)}
        </option>
      ))}
    </select>
  );
}

export function AssigneeCell({ name }: { name: string | null | undefined }) {
  const label = formatAssigneeLabel(name);
  if (label === '—') {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  return <span>{label}</span>;
}
