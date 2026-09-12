/** Phase 1J barrel aging & maturation — statuses and document types. */

export const BARREL_STATUSES = ['Empty', 'Aging', 'Retired'] as const;
export type BarrelStatus = (typeof BARREL_STATUSES)[number];

export const BARREL_FILL_STATUSES = ['Active', 'Dumped', 'Reversed'] as const;
export type BarrelFillStatus = (typeof BARREL_FILL_STATUSES)[number];

export const DEFAULT_COOPERAGE_TYPES = [
  '53 US gal Standard',
  '53 US gal Heavy Toast',
  '30 US gal',
  '15 US gal',
  'Hogshead',
  'Other',
] as const;

export const DEFAULT_WOOD_TYPES = [
  'American Oak',
  'French Oak',
  'European Oak',
  'Used Bourbon',
  'Used Sherry',
  'Other',
] as const;

export const BARREL_DOCUMENT_TYPES = {
  FILL: 'barrel_fill',
  DUMP: 'barrel_dump',
  OBSERVATION: 'barrel_observation',
} as const;
