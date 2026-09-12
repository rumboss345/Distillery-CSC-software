/**
 * Planned cost estimate — NOT actual cost. Does not post transactions.
 */

export type PlannedCostIngredient = {
  ingredientType: string;
  quantity: number;
  unit: string;
  unitPriceKyd: number;
  optional?: boolean;
};

export type PlannedCostEstimate = {
  rawMaterialCostKyd: number;
  bulkSpiritCostKyd: number;
  packagingCostKyd: number;
  conversionCostKyd: number;
  totalEstimatedCostKyd: number;
  estimatedCostPerLitreKyd: number | null;
  estimatedCostPerUnitKyd: number | null;
  label: 'PLANNED ESTIMATE — NOT ACTUAL COST';
};

export function estimatePlannedBatchCost(input: {
  ingredients: PlannedCostIngredient[];
  conversionCostKyd?: number;
  targetBatchSizeLitres?: number | null;
  unitsPerOutput?: number | null;
}): PlannedCostEstimate {
  let rawMaterial = 0;
  let bulkSpirit = 0;
  let packaging = 0;

  for (const ing of input.ingredients) {
    if (ing.optional) continue;
    const extended = ing.quantity * ing.unitPriceKyd;
    const type = ing.ingredientType.toLowerCase();
    if (type.includes('bulk') || type.includes('spirit')) bulkSpirit += extended;
    else if (type.includes('packaging') || type.includes('bottle') || type.includes('label')) packaging += extended;
    else rawMaterial += extended;
  }

  const conversion = input.conversionCostKyd ?? 0;
  const total = rawMaterial + bulkSpirit + packaging + conversion;
  const vol = input.targetBatchSizeLitres ?? null;
  const units = input.unitsPerOutput ?? null;

  return {
    rawMaterialCostKyd: rawMaterial,
    bulkSpiritCostKyd: bulkSpirit,
    packagingCostKyd: packaging,
    conversionCostKyd: conversion,
    totalEstimatedCostKyd: total,
    estimatedCostPerLitreKyd: vol != null && vol > 0 ? total / vol : null,
    estimatedCostPerUnitKyd: units != null && units > 0 ? total / units : null,
    label: 'PLANNED ESTIMATE — NOT ACTUAL COST',
  };
}
