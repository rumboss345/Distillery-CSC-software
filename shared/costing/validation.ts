import type { CostStatus } from './constants.js';

export function isKnownZeroCost(unitCostKyd: number, costStatus: CostStatus): boolean {
  return costStatus === 'VALUED' && unitCostKyd === 0;
}

export function isUnknownCost(costStatus: CostStatus): boolean {
  return costStatus === 'UNVALUED';
}

export function formatCostDisplay(
  amount: number | null | undefined,
  costStatus: CostStatus,
): string {
  if (costStatus === 'UNVALUED' || amount == null) return 'Unvalued';
  return amount.toFixed(2);
}

export function assertNotLegacyMaterial(trackingMode: string): void {
  if (trackingMode === 'LEGACY') {
    throw new Error('LEGACY material inventory is excluded from ledger valuation.');
  }
}

export function assertNotLegacyTank(trackingMode: string): void {
  if (trackingMode === 'LEGACY') {
    throw new Error('LEGACY tanks are excluded from liquid valuation.');
  }
}

export function assertFinalizedImmutable(status: string, action: string): void {
  if (status === 'Finalized' || status === 'FINALIZED') {
    throw new Error(`Cannot ${action}: record is finalized. Use adjustment or reversal.`);
  }
}

export function assertNoHardDelete(status: string): void {
  if (status === 'Finalized' || status === 'FINALIZED') {
    throw new Error('Finalized cost records cannot be hard deleted.');
  }
}
