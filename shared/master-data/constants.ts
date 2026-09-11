/** Expandable lookup types stored in md_lookup_values. */
export const LOOKUP_TYPES = {
  PRODUCT_CATEGORY: 'product_category',
  MATERIAL_TYPE: 'material_type',
  PACKAGING_TYPE: 'packaging_type',
  SPIRIT_TYPE: 'spirit_type',
  SUPPLIER_TYPE: 'supplier_type',
  LOCATION_TYPE: 'location_type',
  PACKAGE_TYPE: 'package_type',
} as const;

export type LookupType = typeof LOOKUP_TYPES[keyof typeof LOOKUP_TYPES];

export const DEFAULT_PRODUCT_CATEGORIES = [
  'Rum', 'Vodka', 'Gin', 'Tequila', 'RTD', 'Liqueur', 'Other Spirit', 'Non-Alcoholic', 'Experimental',
];

export const DEFAULT_MATERIAL_TYPES = [
  'Fermentation Ingredient', 'Processing Ingredient', 'Botanical', 'Sweetener', 'Flavoring',
  'Additive', 'Water Treatment', 'Other Raw Material',
];

export const DEFAULT_PACKAGING_TYPES = [
  'Bottle', 'Can', 'Closure', 'Cork', 'Cap', 'Label', 'Sleeve', 'Carton', 'Case',
  'Divider', 'Pallet', 'Keg', 'Seal', 'Other Packaging',
];

export const DEFAULT_SPIRIT_TYPES = [
  'Neutral Grain Spirit', 'Vodka Base', 'Rum', 'Tequila', 'Gin Base', 'Whiskey', 'Brandy', 'Other Spirit',
];

export const DEFAULT_SUPPLIER_TYPES = [
  'Raw Materials', 'Packaging', 'Bulk Spirit', 'Equipment', 'Services', 'Other',
];

export const DEFAULT_LOCATION_TYPES = [
  'Raw Material Warehouse', 'Packaging Warehouse', 'Bulk Spirit Storage', 'Production Floor',
  'Tank Farm', 'Barrel Warehouse', 'Finished Goods Warehouse', 'Airport', 'Retail',
  'Offsite Storage', 'Other',
];

export const DEFAULT_PACKAGE_TYPES = [
  'bottle', 'can', 'keg', 'bag-in-box', 'tote', 'bulk', 'other',
];

export const PRODUCT_STATUSES = ['Active', 'Inactive', 'Development'] as const;
export const SKU_STATUSES = ['Active', 'Inactive'] as const;

export const CODE_PREFIXES = {
  product: 'PROD',
  sku: 'SKU',
  rawMaterial: 'RM',
  packaging: 'PKG',
  bulkSpirit: 'BS',
  supplier: 'SUP',
  location: 'LOC',
  recipe: 'REC',
  lot: 'LOT',
  tank: 'TNK',
  liquidTransaction: 'LTX',
  operationGroup: 'LGO',
  productionOrder: 'PO',
  productionBatch: 'PB',
  materialLot: 'MLT',
  materialTransaction: 'MTX',
  materialOperationGroup: 'MGO',
  purchaseOrder: 'PUR',
  receipt: 'RCV',
  landedCost: 'LCD',
  costAdjustment: 'CADJ',
  packagingRun: 'PKR',
  fgLot: 'FGL',
  fgTransaction: 'FGT',
  barrel: 'BRL',
  barrelFill: 'BFL',
  barrelObservation: 'BOB',
  barrelDump: 'BDP',
  qcSpec: 'QSP',
  qcSample: 'QSM',
  qcHold: 'QHD',
  qcCoa: 'COA',
  inventoryTransfer: 'INV-TR',
  cycleCount: 'CNT',
  mwo: 'MWO',
  pmSchedule: 'PMS',
  downtime: 'DTN',
  demandForecast: 'DFC',
  productionPlan: 'PPL',
  mrpRun: 'MRP',
  scheduleSlot: 'SCH',
} as const;

export const DEFAULT_UNITS = [
  { code: 'L', name: 'Litres', unit_type: 'liquid' },
  { code: 'mL', name: 'Millilitres', unit_type: 'liquid' },
  { code: 'US_gal', name: 'US Gallons', unit_type: 'liquid' },
  { code: 'fl_oz', name: 'Fluid Ounces', unit_type: 'liquid' },
  { code: 'kg', name: 'Kilograms', unit_type: 'weight' },
  { code: 'g', name: 'Grams', unit_type: 'weight' },
  { code: 'lb', name: 'Pounds', unit_type: 'weight' },
  { code: 'oz', name: 'Ounces', unit_type: 'weight' },
  { code: 'each', name: 'Each', unit_type: 'count' },
  { code: 'case', name: 'Case', unit_type: 'count' },
  { code: 'pallet', name: 'Pallet', unit_type: 'count' },
  { code: 'bag', name: 'Bag', unit_type: 'count' },
  { code: 'drum', name: 'Drum', unit_type: 'count' },
  { code: 'tote', name: 'Tote', unit_type: 'count' },
  { code: 'keg', name: 'Keg', unit_type: 'count' },
] as const;
