/**
 * Staff-to-staff messages live on the auth database (not the synced production DB).
 */

export interface StaffMessageRow {
  id: number;
  sender_id: number;
  recipient_id: number;
  subject: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  parent_id: number | null;
  parent_body: string | null;
  parent_created_at: string | null;
  parent_sender_name: string | null;
  parent_sender_email: string | null;
  sender_email: string;
  sender_name: string | null;
  recipient_email: string;
  recipient_name: string | null;
}

/** Whether sender and recipient are the two parties on the parent message. */
export function staffMessageParentAllowed(
  senderId: number,
  recipientId: number,
  parent: Pick<StaffMessageRow, 'sender_id' | 'recipient_id'>,
): boolean {
  const parties = new Set([parent.sender_id, parent.recipient_id]);
  return parties.has(senderId) && parties.has(recipientId) && senderId !== recipientId;
}

export const STAFF_MESSAGE_BODY_MAX = 2000;
export const STAFF_MESSAGE_SUBJECT_MAX = 160;

export function normalizeStaffMessageSubject(raw: string): string | null {
  const subject = raw.trim();
  if (!subject) return null;
  if (subject.length > STAFF_MESSAGE_SUBJECT_MAX) return null;
  return subject;
}

export function normalizeStaffMessageBody(raw: string): string | null {
  const body = raw.trim();
  if (!body) return null;
  if (body.length > STAFF_MESSAGE_BODY_MAX) return null;
  return body;
}
