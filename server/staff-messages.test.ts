import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('staff messages (sqlite auth)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csc-staff-msg-'));
  let auth: typeof import('./auth-sqlite.ts');

  beforeAll(async () => {
    process.env.DATA_DIR = dir;
    delete process.env.DATABASE_URL;
    auth = await import('./auth-sqlite.ts');
    auth.initializeAuthDatabase();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('sends a message, counts unread, marks read', () => {
    const sender = auth.createUserByAdmin(
      'sender@csc.test',
      'SenderPass1',
      'Sender',
      ['inventory'],
      ['fermentation'],
    );
    const recipient = auth.createUserByAdmin(
      'recipient@csc.test',
      'RecipientPass1',
      'Recipient',
      ['wash'],
      ['distillation'],
    );

    expect(auth.isApprovedStaffUser(recipient.id)).toBe(true);
    const created = auth.createStaffMessage(sender.id, recipient.id, 'Tank 4 needs a sample.');
    expect(created?.body).toContain('Tank 4');

    expect(auth.countStaffMessagesUnread(recipient.id)).toBe(1);
    const incoming = auth.listStaffMessagesIncomingAfter(recipient.id, 0, 10);
    expect(incoming).toHaveLength(1);

    const inbox = auth.listStaffMessagesInbox(recipient.id, 10);
    expect(inbox[0].sender_email).toBe('sender@csc.test');

    expect(auth.markStaffMessageRead(created!.id, recipient.id)).toBe(true);
    expect(auth.countStaffMessagesUnread(recipient.id)).toBe(0);
    expect(auth.listStaffMessagesIncomingAfter(recipient.id, 0, 10)).toHaveLength(0);

    const sent = auth.listStaffMessagesSent(sender.id, 10);
    expect(sent).toHaveLength(1);
  });
});
