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

  it('broadcasts one message to every other approved staff member', () => {
    const sender = auth.createUserByAdmin(
      'broadcaster@csc.test',
      'BroadcastPass1',
      'Broadcaster',
      [],
      [],
    );
    const a = auth.createUserByAdmin('staff-a@csc.test', 'StaffPass1', 'Staff A', [], []);
    const b = auth.createUserByAdmin('staff-b@csc.test', 'StaffPass2', 'Staff B', [], []);

    const expectedCount = auth.listStaffMessageRecipientIds(sender.id).length;
    const result = auth.createStaffMessageBroadcast(sender.id, 'Line 3 is down for cleaning.');
    expect(result.recipientCount).toBe(expectedCount);
    expect(auth.countStaffMessagesUnread(a.id)).toBe(1);
    expect(auth.countStaffMessagesUnread(b.id)).toBe(1);
    expect(auth.listStaffMessagesSent(sender.id, 10)).toHaveLength(expectedCount);
  });

  it('lists direct messages between two staff for oversight', () => {
    const alice = auth.createUserByAdmin('alice@csc.test', 'AlicePass1', 'Alice', [], []);
    const bob = auth.createUserByAdmin('bob@csc.test', 'BobPass1', 'Bob', [], []);
    const carol = auth.createUserByAdmin('carol@csc.test', 'CarolPass1', 'Carol', [], []);

    auth.createStaffMessage(alice.id, bob.id, 'Can you pull a sample?');
    auth.createStaffMessage(bob.id, alice.id, 'Done — Brix is 8.2.');
    auth.createStaffMessage(alice.id, carol.id, 'Unrelated note');

    const thread = auth.listStaffMessagesBetween(alice.id, bob.id, 20);
    expect(thread).toHaveLength(2);
    expect(thread.map((m) => m.body).sort()).toEqual([
      'Can you pull a sample?',
      'Done — Brix is 8.2.',
    ]);

    expect(auth.listStaffMessagesBetween(alice.id, carol.id, 20)).toHaveLength(1);
    expect(auth.listStaffMessagesBetween(bob.id, carol.id, 20)).toHaveLength(0);
  });
});
