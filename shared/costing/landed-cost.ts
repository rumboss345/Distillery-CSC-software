import type { AllocationMethod } from './constants.js';
import { assertAllocationTotal, allocateProportionally } from './money.js';

export type ReceiptLineAllocationBasis = {
  receiptLineId: number;
  receiptId: number;
  materialLotId: number | null;
  purchaseValueKyd: number;
  quantity: number;
  baseUnit: string;
  weightKg: number | null;
  volumeLitres: number | null;
};

export type ManualAllocationInput = {
  receiptLineId: number;
  allocatedKydAmount: number;
};

export type AllocationPreviewLine = {
  receiptLineId: number;
  materialLotId: number | null;
  allocationBasis: string;
  basisValue: number | null;
  allocationPercent: number | null;
  allocatedKydAmount: number;
};

export type AllocationPreviewResult = {
  lines: AllocationPreviewLine[];
  totalAllocated: number;
};

function unitCategory(unit: string): 'count' | 'weight' | 'volume' | 'other' {
  const u = unit.toLowerCase();
  if (['each', 'case', 'pallet', 'bottle', 'can'].includes(u)) return 'count';
  if (['kg', 'g', 'lb', 'oz'].includes(u)) return 'weight';
  if (['l', 'ml', 'us_gal', 'fl_oz'].includes(u)) return 'volume';
  return 'other';
}

export function validateQuantityAllocationCompatibility(lines: ReceiptLineAllocationBasis[]): void {
  if (lines.length < 2) return;
  const categories = new Set(lines.map((l) => unitCategory(l.baseUnit)));
  if (categories.size > 1) {
    throw new Error(
      'BY_QUANTITY allocation blocked: receipt lines use incompatible dimensional units.',
    );
  }
}

export function previewLandedCostAllocation(
  method: AllocationMethod,
  componentTotalKyd: number,
  receiptLines: ReceiptLineAllocationBasis[],
  manualAllocations?: ManualAllocationInput[],
): AllocationPreviewResult {
  if (receiptLines.length === 0) {
    throw new Error('At least one receipt line is required for allocation.');
  }

  let weights: number[] = [];
  let basisLabel = method;

  switch (method) {
    case 'BY_PURCHASE_VALUE':
      weights = receiptLines.map((l) => l.purchaseValueKyd);
      break;
    case 'BY_QUANTITY':
      validateQuantityAllocationCompatibility(receiptLines);
      weights = receiptLines.map((l) => l.quantity);
      break;
    case 'BY_WEIGHT':
      if (receiptLines.some((l) => l.weightKg == null || l.weightKg <= 0)) {
        throw new Error('BY_WEIGHT allocation blocked: weight information missing.');
      }
      weights = receiptLines.map((l) => l.weightKg!);
      break;
    case 'BY_VOLUME':
      if (receiptLines.some((l) => l.volumeLitres == null || l.volumeLitres <= 0)) {
        throw new Error('BY_VOLUME allocation blocked: volume information missing.');
      }
      weights = receiptLines.map((l) => l.volumeLitres!);
      break;
    case 'MANUAL': {
      if (!manualAllocations || manualAllocations.length === 0) {
        throw new Error('Manual allocations are required for MANUAL method.');
      }
      const manualMap = new Map(manualAllocations.map((m) => [m.receiptLineId, m.allocatedKydAmount]));
      const amounts = receiptLines.map((l) => manualMap.get(l.receiptLineId) ?? 0);
      assertAllocationTotal(amounts, componentTotalKyd);
      return {
        lines: receiptLines.map((l, i) => ({
          receiptLineId: l.receiptLineId,
          materialLotId: l.materialLotId,
          allocationBasis: 'MANUAL',
          basisValue: null,
          allocationPercent: null,
          allocatedKydAmount: amounts[i]!,
        })),
        totalAllocated: amounts.reduce((s, v) => s + v, 0),
      };
    }
    default:
      throw new Error(`Unknown allocation method: ${method}`);
  }

  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum <= 0) throw new Error('Allocation basis values must be positive.');

  const allocated = allocateProportionally(componentTotalKyd, weights);
  assertAllocationTotal(allocated, componentTotalKyd);

  return {
    lines: receiptLines.map((l, i) => ({
      receiptLineId: l.receiptLineId,
      materialLotId: l.materialLotId,
      allocationBasis: basisLabel,
      basisValue: weights[i] ?? null,
      allocationPercent: weightSum > 0 ? ((weights[i] ?? 0) / weightSum) * 100 : null,
      allocatedKydAmount: allocated[i]!,
    })),
    totalAllocated: allocated.reduce((s, v) => s + v, 0),
  };
}
