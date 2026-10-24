import { describe, expect, it } from 'vitest';
import { AUDIT_ARCHIVE_MONTHS, auditArchiveCutoff, formatAuditTimestamp } from './audit-archive';

describe('audit archive cutoff', () => {
  it('keeps a 3-month window in UTC', () => {
    expect(AUDIT_ARCHIVE_MONTHS).toBe(3);
    expect(formatAuditTimestamp(new Date('2026-10-24T12:30:45.000Z'))).toBe('2026-10-24 12:30:45');
    expect(auditArchiveCutoff(new Date('2026-10-24T12:30:45.000Z'))).toBe('2026-07-24 12:30:45');
  });

  it('archives a row from four months ago and keeps last month', () => {
    const now = new Date('2026-10-24T08:00:00.000Z');
    const cutoff = auditArchiveCutoff(now);
    expect('2026-06-24 08:00:00' < cutoff).toBe(true);
    expect('2026-09-24 08:00:00' < cutoff).toBe(false);
  });
});
