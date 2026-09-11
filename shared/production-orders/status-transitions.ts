import { PRODUCTION_BATCH_STATUSES, PRODUCTION_ORDER_STATUSES } from './constants.js';

export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number];
export type ProductionBatchStatus = (typeof PRODUCTION_BATCH_STATUSES)[number];

const ORDER_TRANSITIONS: Record<string, ProductionOrderStatus[]> = {
  Draft: ['Planned', 'Cancelled'],
  Planned: ['Released', 'Cancelled'],
  Released: ['In Progress', 'Cancelled'],
  'In Progress': ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

const BATCH_TRANSITIONS: Record<string, ProductionBatchStatus[]> = {
  Ready: ['In Progress', 'Cancelled'],
  'In Progress': ['Paused', 'Completed', 'Cancelled'],
  Paused: ['In Progress', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

export function assertOrderStatusTransition(from: string, to: string): void {
  const allowed = ORDER_TRANSITIONS[from];
  if (!allowed?.includes(to as ProductionOrderStatus)) {
    throw new Error(`Invalid production order status transition: ${from} → ${to}`);
  }
}

export function assertBatchStatusTransition(from: string, to: string): void {
  const allowed = BATCH_TRANSITIONS[from];
  if (!allowed?.includes(to as ProductionBatchStatus)) {
    throw new Error(`Invalid production batch status transition: ${from} → ${to}`);
  }
}

export function isOrderEditable(status: string): boolean {
  return status === 'Draft' || status === 'Planned';
}

export function isOrderReleased(status: string): boolean {
  return status === 'Released' || status === 'In Progress' || status === 'Completed';
}
