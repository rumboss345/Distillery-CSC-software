import { ISSUEABLE_LOT_STATUSES, MATERIAL_TYPES, type MaterialType } from './constants.js';

export function validatePositiveQuantity(qty: number, label = 'Quantity'): void {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

export function validateNonNegativeQuantity(qty: number, label = 'Quantity'): void {
  if (!Number.isFinite(qty) || qty < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
}

export function validateSufficientMaterialBalance(
  available: number,
  required: number,
  context: string,
): void {
  if (required > available + 1e-9) {
    throw new Error(`Insufficient ${context}: ${available} available, ${required} required.`);
  }
}

export function validateMaterialIdentity(input: {
  materialType: MaterialType;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
}): void {
  if (!MATERIAL_TYPES.includes(input.materialType)) {
    throw new Error(`Invalid material type: ${input.materialType}`);
  }
  const hasRaw = input.rawMaterialId != null;
  const hasPkg = input.packagingMaterialId != null;
  if (hasRaw === hasPkg) {
    throw new Error('Exactly one of raw_material_id or packaging_material_id must be set.');
  }
  if (input.materialType === 'RAW_MATERIAL' && !hasRaw) {
    throw new Error('RAW_MATERIAL requires raw_material_id.');
  }
  if (input.materialType === 'PACKAGING_MATERIAL' && !hasPkg) {
    throw new Error('PACKAGING_MATERIAL requires packaging_material_id.');
  }
}

export function validateLotIssueable(status: string): void {
  if (!ISSUEABLE_LOT_STATUSES.includes(status as typeof ISSUEABLE_LOT_STATUSES[number])) {
    throw new Error(`Lot status "${status}" is not eligible for production issue.`);
  }
}

export function validateLossReason(reason: string): void {
  if (!reason.trim()) {
    throw new Error('Loss reason is required.');
  }
}
