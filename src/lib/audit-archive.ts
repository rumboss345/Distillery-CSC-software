/** Live audit rows older than this many months move to `audit_events_archive`. */
export const AUDIT_ARCHIVE_MONTHS = 3;

/** UTC stamp matching PostgreSQL `audit_events.created_at`. */
export function formatAuditTimestamp(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/** Rows with `created_at` before this UTC stamp belong in the archive. */
export function auditArchiveCutoff(now = new Date()): string {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - AUDIT_ARCHIVE_MONTHS);
  return formatAuditTimestamp(cutoff);
}

export const ARCHIVE_OLD_AUDIT_INSERT = `
  INSERT INTO audit_events_archive (id, user_id, email, action, summary, created_at)
  SELECT id, user_id, email, action, summary, created_at
  FROM audit_events
  WHERE created_at < $1
  ON CONFLICT (id) DO NOTHING
`;

export const ARCHIVE_OLD_AUDIT_DELETE = `DELETE FROM audit_events WHERE created_at < $1`;
