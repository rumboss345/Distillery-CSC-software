import { DISCRETE_COUNT_UNITS, ISSUEABLE_LOT_STATUSES, MATERIAL_TYPES, type MaterialType } from './constants.js';

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

export function validateLotIssueable(status: string, expirationDate?: string | null): void {
  if (!ISSUEABLE_LOT_STATUSES.includes(status as typeof ISSUEABLE_LOT_STATUSES[number])) {
    throw new Error(`Lot status "${status}" is not eligible for production issue.`);
  }
  if (expirationDate) {
    const exp = new Date(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(exp.getTime()) && exp < today) {
      throw new Error(`Lot is past expiration date (${expirationDate}) and cannot be issued.`);
    }
  }
}

export function validateDiscreteBaseQuantity(baseQuantity: number, baseUnit: string): void {
  const unit = baseUnit.toLowerCase();
  if (!DISCRETE_COUNT_UNITS.includes(unit as typeof DISCRETE_COUNT_UNITS[number])) return;
  if (Math.abs(baseQuantity - Math.round(baseQuantity)) > 1e-9) {
    throw new Error(`Discrete unit "${baseUnit}" requires whole-number quantities; got ${baseQuantity}.`);
  }
}

export function validateLossReason(reason: string): void {
  if (!reason.trim()) {
    throw new Error('Loss reason is required.');
  }
}
