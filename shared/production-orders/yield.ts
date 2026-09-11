/** Reusable yield and variance calculations for production execution. */

export function volumeYieldPercent(actualVolume: number, expectedVolume: number): number | null {
  if (expectedVolume <= 0) return null;
  return (actualVolume / expectedVolume) * 100;
}

export function alcoholYieldPercent(actualLpa: number, expectedLpa: number): number | null {
  if (expectedLpa <= 0) return null;
  return (actualLpa / expectedLpa) * 100;
}

export function ingredientVariancePercent(actual: number, planned: number): number | null {
  if (planned === 0) return actual === 0 ? 0 : null;
  return ((actual - planned) / planned) * 100;
}

export function quantityVariance(actual: number, planned: number): number {
  return actual - planned;
}

export interface PlannedVsActualLine {
  requirementId: number | null;
  inputType: string;
  description: string;
  unit: string;
  plannedQuantity: number;
  actualQuantity: number;
  variance: number;
  variancePercent: number | null;
  plannedVolumeLitres: number | null;
  actualVolumeLitres: number | null;
  plannedAbv: number | null;
  actualAbv: number | null;
  plannedLpa: number | null;
  actualLpa: number | null;
}
