/** Phase 1F purchasing constants. */

export const PURCHASE_ORDER_STATUSES = [
  'Draft',
  'Submitted',
  'Partially Received',
  'Received',
  'Closed',
  'Cancelled',
] as const;

export const DEFAULT_CURRENCIES = ['USD', 'KYD', 'EUR', 'GBP'] as const;
