import type { CostStatus } from './constants.js';

export type LiquidCostLayer = {
  volumeLitres: number;
  lpa: number;
  inputCostKyd: number;
  conversionCostKyd: number;
  totalCostKyd: number;
  costStatus: CostStatus;
};

export type LiquidLotValuation = {
  accumulatedCostKyd: number;
  currentVolumeLitres: number;
  currentLpa: number;
  costPerLitreKyd: number | null;
  costPerLpaKyd: number | null;
  costStatus: CostStatus;
};

export function computeLiquidLotValuation(
  layers: LiquidCostLayer[],
  currentVolumeLitres: number,
  currentLpa: number,
): LiquidLotValuation {
  const totalCost = layers.reduce((s, l) => s + l.totalCostKyd, 0);
  const hasUnvalued = layers.some((l) => l.costStatus === 'UNVALUED');
  const costStatus: CostStatus =
    layers.length === 0 || hasUnvalued
      ? 'UNVALUED'
      : totalCost === 0 && !hasUnvalued
        ? 'VALUED'
        : 'VALUED';

  const effectiveStatus = layers.length === 0 ? 'UNVALUED' : hasUnvalued ? 'PARTIALLY_VALUED' : costStatus;

  return {
    accumulatedCostKyd: totalCost,
    currentVolumeLitres,
    currentLpa,
    costPerLitreKyd:
      effectiveStatus !== 'UNVALUED' && currentVolumeLitres > 0
        ? totalCost / currentVolumeLitres
        : null,
    costPerLpaKyd:
      effectiveStatus !== 'UNVALUED' && currentLpa > 0 ? totalCost / currentLpa : null,
    costStatus: effectiveStatus,
  };
}

/** Proof-down: total cost conserved; LPA unchanged; per-litre decreases. */
export function proofDownCostConservation(input: {
  inputVolumeLitres: number;
  inputAbv: number;
  inputTotalCostKyd: number;
  outputVolumeLitres: number;
  outputAbv: number;
  waterCostKyd?: number;
  conversionCostKyd?: number;
}): {
  outputTotalCostKyd: number;
  outputLpa: number;
  costPerLitreKyd: number;
  costPerLpaKyd: number;
} {
  const inputLpa = input.inputVolumeLitres * (input.inputAbv / 100);
  const waterCost = input.waterCostKyd ?? 0;
  const conversionCost = input.conversionCostKyd ?? 0;
  const outputTotal = input.inputTotalCostKyd + waterCost + conversionCost;

  return {
    outputTotalCostKyd: outputTotal,
    outputLpa: inputLpa,
    costPerLitreKyd: input.outputVolumeLitres > 0 ? outputTotal / input.outputVolumeLitres : 0,
    costPerLpaKyd: inputLpa > 0 ? outputTotal / inputLpa : 0,
  };
}

/** Blend: additive cost from inputs + materials + conversion. */
export function blendAdditiveCost(input: {
  liquidInputCostsKyd: number[];
  materialCostKyd: number;
  conversionCostKyd: number;
}): number {
  return (
    input.liquidInputCostsKyd.reduce((s, c) => s + c, 0) +
    input.materialCostKyd +
    input.conversionCostKyd
  );
}

/** Process loss: total cost conserved; unit cost rises. */
export function processLossCostConservation(
  totalCostKyd: number,
  _inputVolumeLitres: number,
  outputVolumeLitres: number,
): { outputTotalCostKyd: number; costPerLitreKyd: number } {
  return {
    outputTotalCostKyd: totalCostKyd,
    costPerLitreKyd: outputVolumeLitres > 0 ? totalCostKyd / outputVolumeLitres : 0,
  };
}

/** Transfer: proportional cost by volume from homogeneous lot. */
export function proportionalTransferCost(
  lotTotalCostKyd: number,
  lotVolumeLitres: number,
  transferVolumeLitres: number,
): { transferredCostKyd: number; remainingCostKyd: number } {
  if (lotVolumeLitres <= 0) throw new Error('Lot volume must be positive for cost transfer.');
  const ratio = transferVolumeLitres / lotVolumeLitres;
  const transferred = lotTotalCostKyd * ratio;
  return {
    transferredCostKyd: transferred,
    remainingCostKyd: lotTotalCostKyd - transferred,
  };
}

/** Reverse transfer restores original lot cost. */
export function reverseTransferCost(
  sourceCostKyd: number,
  destCostKyd: number,
  transferCostKyd: number,
): { sourceAfterKyd: number; destAfterKyd: number; companyTotalKyd: number } {
  return {
    sourceAfterKyd: sourceCostKyd + transferCostKyd,
    destAfterKyd: destCostKyd - transferCostKyd,
    companyTotalKyd: sourceCostKyd + destCostKyd,
  };
}
