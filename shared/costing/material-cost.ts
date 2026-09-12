import type { CostStatus } from './constants.js';
import { fromMinor, multiplyMoney, toMinor } from './money.js';

export type MaterialLotCostLayer = {
  purchaseCostKyd: number;
  landedCostKyd: number;
  totalCostKyd: number;
  unitCostKyd: number;
  quantityBasis: number;
  costStatus: CostStatus;
};

export type MaterialLotValuation = {
  originalPurchaseCostKyd: number;
  allocatedLandedCostKyd: number;
  totalHistoricalLotCostKyd: number;
  originalReceivedQuantity: number;
  currentQuantity: number;
  historicalUnitLandedCostKyd: number | null;
  remainingInventoryValueKyd: number | null;
  consumedQuantity: number;
  historicalConsumedCostKyd: number | null;
  costStatus: CostStatus;
};

export function deriveCostStatus(
  hasKnownCost: boolean,
  hasPartialCost: boolean,
): CostStatus {
  if (!hasKnownCost) return 'UNVALUED';
  if (hasPartialCost) return 'PARTIALLY_VALUED';
  return 'VALUED';
}

export function computeMaterialLotValuation(
  layers: MaterialLotCostLayer[],
  originalReceivedQty: number,
  currentQty: number,
): MaterialLotValuation {
  const purchaseCost = layers.reduce((s, l) => s + l.purchaseCostKyd, 0);
  const landedCost = layers.reduce((s, l) => s + l.landedCostKyd, 0);
  const totalCost = layers.reduce((s, l) => s + l.totalCostKyd, 0);

  const hasAnyLayer = layers.length > 0;
  const hasUnvaluedLayer = layers.some((l) => l.costStatus === 'UNVALUED');
  const hasPartial = layers.some((l) => l.costStatus === 'PARTIALLY_VALUED');

  let costStatus: CostStatus = 'UNVALUED';
  if (hasAnyLayer && totalCost > 0) {
    costStatus = hasPartial || hasUnvaluedLayer ? 'PARTIALLY_VALUED' : 'VALUED';
  } else if (hasAnyLayer && totalCost === 0 && !hasUnvaluedLayer) {
    costStatus = 'VALUED';
  }

  const unitCost =
    originalReceivedQty > 0 && costStatus !== 'UNVALUED'
      ? totalCost / originalReceivedQty
      : null;

  const consumedQty = Math.max(0, originalReceivedQty - currentQty);
  const remainingValue =
    unitCost != null && Number.isFinite(unitCost) && costStatus !== 'UNVALUED'
      ? fromMinor(multiplyMoney(toMinor(unitCost), currentQty))
      : null;
  const consumedCost =
    unitCost != null && Number.isFinite(unitCost) && costStatus !== 'UNVALUED'
      ? fromMinor(multiplyMoney(toMinor(unitCost), consumedQty))
      : null;

  return {
    originalPurchaseCostKyd: purchaseCost,
    allocatedLandedCostKyd: landedCost,
    totalHistoricalLotCostKyd: totalCost,
    originalReceivedQuantity: originalReceivedQty,
    currentQuantity: currentQty,
    historicalUnitLandedCostKyd: unitCost,
    remainingInventoryValueKyd: remainingValue,
    consumedQuantity: consumedQty,
    historicalConsumedCostKyd: consumedCost,
    costStatus,
  };
}

export function snapshotConsumptionCost(
  unitCostKyd: number | null,
  baseQuantityConsumed: number,
  costStatus: CostStatus,
): { extendedCostKyd: number | null; effectiveStatus: CostStatus } {
  if (costStatus === 'UNVALUED' || unitCostKyd == null) {
    return { extendedCostKyd: null, effectiveStatus: 'UNVALUED' };
  }
  const extended = fromMinor(multiplyMoney(toMinor(unitCostKyd), baseQuantityConsumed));
  return { extendedCostKyd: extended, effectiveStatus: costStatus };
}

export function netMaterialConsumptionCost(
  issues: { baseQuantity: number; extendedCostKyd: number | null }[],
  returns: { baseQuantity: number; extendedCostKyd: number | null }[],
): { netQuantity: number; netCostKyd: number | null; costStatus: CostStatus } {
  const issuedQty = issues.reduce((s, i) => s + i.baseQuantity, 0);
  const returnedQty = returns.reduce((s, r) => s + r.baseQuantity, 0);
  const netQty = issuedQty - returnedQty;

  const hasUnvalued =
    issues.some((i) => i.extendedCostKyd == null) ||
    returns.some((r) => r.extendedCostKyd == null);

  if (hasUnvalued) {
    return { netQuantity: netQty, netCostKyd: null, costStatus: 'UNVALUED' };
  }

  const issuedCost = issues.reduce((s, i) => s + (i.extendedCostKyd ?? 0), 0);
  const returnedCost = returns.reduce((s, r) => s + (r.extendedCostKyd ?? 0), 0);
  return { netQuantity: netQty, netCostKyd: issuedCost - returnedCost, costStatus: 'VALUED' };
}
