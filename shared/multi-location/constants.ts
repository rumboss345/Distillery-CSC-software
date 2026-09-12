/** Phase 1I multi-location inventory constants. */

export const HIERARCHY_LEVELS = [
  'Site',
  'Warehouse',
  'Room',
  'Zone',
  'Aisle',
  'Rack',
  'Bin',
] as const;

export type HierarchyLevel = (typeof HIERARCHY_LEVELS)[number];

export const TRANSFER_DOC_STATUSES = [
  'Draft',
  'Released',
  'In Transit',
  'Received',
  'Cancelled',
] as const;

export type TransferDocStatus = (typeof TRANSFER_DOC_STATUSES)[number];

export const INVENTORY_ITEM_TYPES = ['MATERIAL', 'FINISHED_GOODS'] as const;
export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

export const CYCLE_COUNT_STATUSES = [
  'Draft',
  'In Progress',
  'Review',
  'Posted',
  'Cancelled',
] as const;

export type CycleCountStatus = (typeof CYCLE_COUNT_STATUSES)[number];

export const BARCODE_ENTITY_TYPES = [
  'material_lot',
  'fg_lot',
  'sku',
  'storage_location',
  'production_batch',
  'barrel',
] as const;

export type BarcodeEntityType = (typeof BARCODE_ENTITY_TYPES)[number];

/** System in-transit location code — inventory between sites. */
export const IN_TRANSIT_LOCATION_CODE = 'LOC-IN-TRANSIT';
