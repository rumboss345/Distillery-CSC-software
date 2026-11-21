/** Sender-side read receipt labels (recipient opened the message in Messaging Center). */
export function staffMessageReadReceiptStatus(readAt: string | null | undefined): 'sent' | 'read' {
  return readAt ? 'read' : 'sent';
}

export function staffMessageReadReceiptTitle(readAt: string | null | undefined): string {
  return readAt
    ? 'Read by recipient'
    : 'Sent — not read yet';
}