import { describe, expect, it } from 'vitest';
import { staffMessageReadReceiptStatus, staffMessageReadReceiptTitle } from './staff-message-read-receipt';

describe('staff message read receipt', () => {
  it('treats missing read time as sent', () => {
    expect(staffMessageReadReceiptStatus(null)).toBe('sent');
    expect(staffMessageReadReceiptTitle(null)).toContain('not read');
  });

  it('treats read time as read', () => {
    expect(staffMessageReadReceiptStatus('2026-11-21 12:00:00')).toBe('read');
    expect(staffMessageReadReceiptTitle('2026-11-21 12:00:00')).toContain('Read by');
  });
});