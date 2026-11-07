/**
 * Staff-to-staff messages live on the auth database (not the synced production DB).
 */

export interface StaffMessageRow {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  created_at: string;
  read_at: string | null;
  sender_email: string;
  sender_name: string | null;
  recipient_email: string;
  recipient_name: string | null;
}

export const STAFF_MESSAGE_BODY_MAX = 2000;

export function normalizeStaffMessageBody(raw: string): string | null {
  const body = raw.trim();
  if (!body) return null;
  if (body.length > STAFF_MESSAGE_BODY_MAX) return null;
  return body;
}
