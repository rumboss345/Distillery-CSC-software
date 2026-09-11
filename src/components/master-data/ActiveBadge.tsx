export function ActiveBadge({ active, label }: { active: boolean | number; label?: string }) {
  const on = Boolean(active);
  return (
    <span className={`badge${on ? '' : ' badge-muted'}`}>
      {label ?? (on ? 'Active' : 'Inactive')}
    </span>
  );
}
