interface StatusBadgeProps {
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  mashing: 'washing',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const normalized = label.toLowerCase().replace(/\s+/g, '-');
  return <span className={`badge badge-${normalized}`}>{label}</span>;
}
