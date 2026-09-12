/** Phase 1N sales channels — operational only, no AR. */
export const SALES_CHANNELS = [
  'Distributor',
  'Restaurant',
  'Retail',
  'Airport',
  'Tasting Room',
  'Internal',
  'Export',
  'Other',
] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const SALES_ORDER_STATUSES = [
  'Draft',
  'Confirmed',
  'Partially Shipped',
  'Shipped',
  'Closed',
  'Cancelled',
] as const;

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const SALES_ORDER_TYPES = [
  'Sale',
  'Depletion',
  'Sample',
  'Promotion',
  'Internal Use',
] as const;

export type SalesOrderType = (typeof SALES_ORDER_TYPES)[number];

export const SHIPMENT_STATUSES = ['Draft', 'Posted', 'Cancelled'] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const LOT_ALLOCATION_METHODS = ['FIFO', 'FEFO', 'Manual'] as const;

export type LotAllocationMethod = (typeof LOT_ALLOCATION_METHODS)[number];

export const RETURN_STATUSES = ['Draft', 'Posted', 'Cancelled'] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_DISPOSITIONS = ['Return to Stock', 'Write-Off', 'Damage'] as const;

export type ReturnDisposition = (typeof RETURN_DISPOSITIONS)[number];
