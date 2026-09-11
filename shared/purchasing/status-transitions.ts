import { PURCHASE_ORDER_STATUSES } from './constants.js';

const PO_TRANSITIONS: Record<string, readonly string[]> = {
  Draft: ['Submitted', 'Cancelled'],
  Submitted: ['Partially Received', 'Received', 'Cancelled'],
  'Partially Received': ['Received', 'Closed', 'Cancelled'],
  Received: ['Closed'],
  Closed: [],
  Cancelled: [],
};

export function assertPurchaseOrderStatusTransition(from: string, to: string): void {
  const allowed = PO_TRANSITIONS[from];
  if (!allowed?.includes(to)) {
    throw new Error(`Invalid purchase order status transition: ${from} → ${to}`);
  }
}

export function isPurchaseOrderEditable(status: string): boolean {
  return status === 'Draft';
}

export function isPurchaseOrderLineEditable(status: string): boolean {
  return status === 'Draft';
}

export function derivePurchaseOrderStatusFromReceipts(
  orderedTotal: number,
  receivedTotal: number,
  currentStatus: string,
): string {
  if (currentStatus === 'Cancelled' || currentStatus === 'Closed') return currentStatus;
  if (receivedTotal <= 0) return currentStatus === 'Draft' ? 'Draft' : 'Submitted';
  if (receivedTotal >= orderedTotal - 1e-9) return 'Received';
  return 'Partially Received';
}

export { PURCHASE_ORDER_STATUSES };
