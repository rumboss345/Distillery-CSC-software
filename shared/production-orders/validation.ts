import { validatePositive, validateRequired } from '../master-data/validation.js';
import { PRODUCTION_ORDER_STATUSES, PRODUCTION_BATCH_STATUSES, PRODUCTION_TYPES } from './constants.js';

export function validateProductionOrderStatus(status: string): void {
  if (!(PRODUCTION_ORDER_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid production order status: ${status}`);
  }
}

export function validateProductionBatchStatus(status: string): void {
  if (!(PRODUCTION_BATCH_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid production batch status: ${status}`);
  }
}

export function validateProductionType(type: string): void {
  if (!(PRODUCTION_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Invalid production type: ${type}`);
  }
}

export function validatePlannedBatchSize(size: number): void {
  validatePositive(size, 'Planned batch size');
}

export function validateLossReason(reason: string): void {
  validateRequired(reason, 'Loss reason');
}
