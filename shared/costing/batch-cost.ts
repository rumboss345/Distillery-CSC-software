import type { CostStatus } from './constants.js';

export type BatchCostInput = {
  materialCostKyd: number | null;
  liquidCostKyd: number | null;
  conversionCostKyd: number | null;
  unvaluedInputCount: number;
};

export type BatchCostResult = {
  materialCostKyd: number | null;
  liquidCostKyd: number | null;
  conversionCostKyd: number;
  totalInputCostKyd: number | null;
  outputVolumeLitres: number;
  outputLpa: number;
  costPerLitreKyd: number | null;
  costPerLpaKyd: number | null;
  plannedCostKyd: number | null;
  varianceKyd: number | null;
  variancePercent: number | null;
  costStatus: CostStatus;
  unvaluedInputCount: number;
};

export function calculateBatchCost(
  input: BatchCostInput,
  outputVolumeLitres: number,
  outputLpa: number,
  plannedCostKyd?: number | null,
): BatchCostResult {
  const conversion = input.conversionCostKyd ?? 0;
  const hasUnvalued = input.unvaluedInputCount > 0;
  const material = input.materialCostKyd;
  const liquid = input.liquidCostKyd;

  let total: number | null = null;
  let costStatus: CostStatus = 'UNVALUED';

  if (!hasUnvalued && material != null && liquid != null) {
    total = material + liquid + conversion;
    costStatus = 'VALUED';
  } else if (material != null || liquid != null || conversion > 0) {
    const partial =
      (material ?? 0) + (liquid ?? 0) + conversion;
    total = hasUnvalued ? null : partial;
    costStatus = hasUnvalued ? 'PARTIALLY_VALUED' : 'INCOMPLETE';
  }

  const variance =
    total != null && plannedCostKyd != null ? total - plannedCostKyd : null;
  const variancePercent =
    variance != null && plannedCostKyd != null && plannedCostKyd !== 0
      ? (variance / plannedCostKyd) * 100
      : null;

  return {
    materialCostKyd: material,
    liquidCostKyd: liquid,
    conversionCostKyd: conversion,
    totalInputCostKyd: total,
    outputVolumeLitres,
    outputLpa,
    costPerLitreKyd:
      total != null && outputVolumeLitres > 0 ? total / outputVolumeLitres : null,
    costPerLpaKyd: total != null && outputLpa > 0 ? total / outputLpa : null,
    plannedCostKyd: plannedCostKyd ?? null,
    varianceKyd: variance,
    variancePercent,
    costStatus,
    unvaluedInputCount: input.unvaluedInputCount,
  };
}

export function aggregateMaterialBatchCost(
  consumptions: { extendedCostKyd: number | null; costStatus: string }[],
): { total: number | null; unvaluedCount: number } {
  const unvaluedCount = consumptions.filter(
    (c) => c.extendedCostKyd == null || c.costStatus === 'UNVALUED',
  ).length;
  if (unvaluedCount > 0) {
    return { total: null, unvaluedCount };
  }
  return {
    total: consumptions.reduce((s, c) => s + (c.extendedCostKyd ?? 0), 0),
    unvaluedCount: 0,
  };
}

export function aggregateLiquidBatchCost(
  inputs: { extendedCostKyd: number | null; costStatus: string }[],
): { total: number | null; unvaluedCount: number } {
  return aggregateMaterialBatchCost(inputs);
}

/** Finalized snapshots cannot be edited in place. */
export function assertBatchSnapshotMutable(status: string): void {
  if (status === 'Finalized' || status === 'FINALIZED' || status === 'Final') {
    throw new Error('Finalized batch cost snapshot cannot be modified directly.');
  }
}
