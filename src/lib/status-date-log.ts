/** Kinds of production records that keep a dated status log. */
export type StatusDateLogKind = 'wash' | 'fermentation' | 'distillation' | 'barrel' | 'equipment';

const STATUS_LABELS: Record<string, string> = {
  planned: 'planned',
  mashing: 'washing',
  fermenting: 'fermenting',
  complete: 'complete',
  discarded: 'discarded',
  running: 'running',
  aging: 'aging',
  empty: 'empty',
  dumped: 'dumped',
  in_use: 'in use',
  cleaning: 'cleaning',
  offline: 'offline',
};

export function statusDateLogLabel(status: string): string {
  const trimmed = status.trim();
  if (!trimmed) return '';
  return STATUS_LABELS[trimmed] ?? trimmed.replace(/_/g, ' ');
}

/** A status change worth writing down. Same status, or a blank next status, is skipped. */
export function statusChangeToLog(
  previousStatus: string | null | undefined,
  nextStatus: string,
): { previous: string; next: string } | null {
  const next = nextStatus.trim();
  if (!next) return null;
  const previous = (previousStatus ?? '').trim();
  if (previous === next) return null;
  return { previous, next };
}

/** One line for the status log, such as "washing → fermenting" or "Set to planned". */
export function statusDateLogText(previousStatus: string, nextStatus: string): string {
  const next = statusDateLogLabel(nextStatus);
  if (!previousStatus.trim()) return `Set to ${next}`;
  return `${statusDateLogLabel(previousStatus)} → ${next}`;
}
