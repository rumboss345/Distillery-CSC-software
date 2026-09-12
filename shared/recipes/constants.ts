/** Expandable lookup types stored in md_lookup_values. */
export const RECIPE_LOOKUP_TYPES = {
  RECIPE_TYPE: 'recipe_type',
} as const;

export const DEFAULT_RECIPE_TYPES = [
  'Fermentation',
  'Distillation',
  'Blending',
  'Proof Down',
  'Gin / Botanical',
  'RTD',
  'Bottling / Packaging',
  'Complete Product Formula',
  'Experimental',
  'Other',
] as const;

export const RECIPE_STATUSES = ['Development', 'Active', 'Inactive'] as const;
export const VERSION_STATUSES = ['Draft', 'Active', 'Archived'] as const;

export const INGREDIENT_TYPES = ['Raw Material', 'Bulk Spirit', 'Water', 'Other'] as const;
export const QUANTITY_BASIS_OPTIONS = [
  'Fixed Quantity',
  'Per Batch',
  'Percentage',
  'Per Litre',
  'Per 100 Litres',
] as const;

/** Phase 1C default implemented basis values. */
export const IMPLEMENTED_QUANTITY_BASIS = ['Fixed Quantity', 'Per Batch'] as const;

export const RECIPE_CODE_PREFIX = 'REC';
