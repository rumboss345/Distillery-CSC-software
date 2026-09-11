import { LOSS_REASON_CODES, TRACKING_MODES } from './constants.js';

export function validateAbv(abv: number): void {
  if (!Number.isFinite(abv) || abv < 0 || abv > 100) {
    throw new Error('ABV must be between 0 and 100.');
  }
}

export function validatePositiveVolume(volumeLitres: number, label = 'Volume'): void {
  if (!Number.isFinite(volumeLitres) || volumeLitres <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

export function validateNonNegativeVolume(volumeLitres: number, label = 'Volume'): void {
  if (!Number.isFinite(volumeLitres) || volumeLitres < 0) {
    throw new Error(`${label} cannot be negative.`);
  }
}

export function validateCapacity(volumeLitres: number, capacityLitres: number): void {
  if (capacityLitres <= 0) return;
  if (volumeLitres > capacityLitres + 1e-9) {
    throw new Error(
      `Tank capacity would be exceeded (${volumeLitres.toFixed(2)} L > ${capacityLitres.toFixed(2)} L capacity).`,
    );
  }
}

export function validateSufficientBalance(
  availableLitres: number,
  requestedLitres: number,
  label = 'Source tank',
): void {
  if (requestedLitres > availableLitres + 1e-6) {
    throw new Error(
      `${label} has insufficient volume (${availableLitres.toFixed(2)} L available, ${requestedLitres.toFixed(2)} L requested).`,
    );
  }
}

export function validateReasonCode(reason: string | null | undefined, required = true): void {
  const trimmed = (reason ?? '').trim();
  if (required && !trimmed) {
    throw new Error('A reason is required for this adjustment.');
  }
  if (trimmed && !LOSS_REASON_CODES.includes(trimmed as (typeof LOSS_REASON_CODES)[number])) {
    throw new Error(`Invalid reason code "${trimmed}".`);
  }
}

export function validateTrackingMode(mode: string): void {
  if (!TRACKING_MODES.includes(mode as (typeof TRACKING_MODES)[number])) {
    throw new Error(`Invalid tracking mode "${mode}".`);
  }
}

export function validateTankName(name: string): void {
  if (!name.trim()) throw new Error('Tank name is required.');
}

export function validateLotType(lotType: string): void {
  if (!lotType.trim()) throw new Error('Lot type is required.');
}
