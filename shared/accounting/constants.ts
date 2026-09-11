/** Phase 1Q — browser-local accounting integration (no live QuickBooks sync). */

export const ACCOUNTING_EVENT_TYPES = [
  'Receipt',
  'Landed Cost',
  'Production Consumption',
  'Production Output',
  'FG Shipment',
  'Inventory Adjustment',
  'Cost Adjustment',
  'Reversal',
] as const;

export type AccountingEventType = (typeof ACCOUNTING_EVENT_TYPES)[number];

/** Configurable operational categories mapped to GL accounts — not hard-coded account numbers. */
export const OPERATIONAL_ACCOUNT_CATEGORIES = [
  'RAW_MATERIAL_INVENTORY',
  'PACKAGING_INVENTORY',
  'ACCOUNTS_PAYABLE',
  'FREIGHT_CLEARING',
  'WIP',
  'LIQUID_INVENTORY',
  'FG_INVENTORY',
  'COGS',
  'INVENTORY_ADJUSTMENT',
  'COST_VARIANCE',
] as const;

export type OperationalAccountCategory = (typeof OPERATIONAL_ACCOUNT_CATEGORIES)[number];

export const ACCOUNTING_EVENT_STATUSES = ['Pending', 'Exported', 'Reversed'] as const;
export type AccountingEventStatus = (typeof ACCOUNTING_EVENT_STATUSES)[number];

export const EXPORT_FORMATS = ['CSV', 'JSON'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const QUICKBOOKS_ADAPTER_TYPES = ['Manual', 'QuickBooksOnline', 'QuickBooksDesktop'] as const;
export type QuickBooksAdapterType = (typeof QUICKBOOKS_ADAPTER_TYPES)[number];

export const EXPORT_BATCH_STATUSES = ['Draft', 'Completed', 'Failed'] as const;
export type ExportBatchStatus = (typeof EXPORT_BATCH_STATUSES)[number];

export const RECONCILIATION_STATUSES = ['Pending', 'Reconciled', 'Discrepancy'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const DEFAULT_ACCOUNT_MAPPINGS: Array<{
  operationalCategory: OperationalAccountCategory;
  glAccountNumber: string;
  glAccountName: string;
  description: string;
}> = [
  {
    operationalCategory: 'RAW_MATERIAL_INVENTORY',
    glAccountNumber: '1300',
    glAccountName: 'Raw Material Inventory',
    description: 'Default raw material inventory asset',
  },
  {
    operationalCategory: 'PACKAGING_INVENTORY',
    glAccountNumber: '1310',
    glAccountName: 'Packaging Inventory',
    description: 'Default packaging inventory asset',
  },
  {
    operationalCategory: 'ACCOUNTS_PAYABLE',
    glAccountNumber: '2100',
    glAccountName: 'Accounts Payable',
    description: 'Trade payables clearing',
  },
  {
    operationalCategory: 'FREIGHT_CLEARING',
    glAccountNumber: '2150',
    glAccountName: 'Freight Accrual',
    description: 'Landed cost freight clearing',
  },
  {
    operationalCategory: 'WIP',
    glAccountNumber: '1400',
    glAccountName: 'Work in Process',
    description: 'Production WIP',
  },
  {
    operationalCategory: 'LIQUID_INVENTORY',
    glAccountNumber: '1350',
    glAccountName: 'Bulk Spirit Inventory',
    description: 'Liquid / bulk spirit inventory',
  },
  {
    operationalCategory: 'FG_INVENTORY',
    glAccountNumber: '1500',
    glAccountName: 'Finished Goods Inventory',
    description: 'Finished goods inventory asset',
  },
  {
    operationalCategory: 'COGS',
    glAccountNumber: '5100',
    glAccountName: 'Cost of Goods Sold',
    description: 'Operational COGS from shipments',
  },
  {
    operationalCategory: 'INVENTORY_ADJUSTMENT',
    glAccountNumber: '5900',
    glAccountName: 'Inventory Adjustments',
    description: 'Cycle count and manual adjustments',
  },
  {
    operationalCategory: 'COST_VARIANCE',
    glAccountNumber: '5950',
    glAccountName: 'Cost Variance',
    description: 'Manual cost adjustments',
  },
];
