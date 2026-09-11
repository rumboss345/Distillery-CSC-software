/**
 * Phase 1M MRP calculation engine — read-only planning math; does not mutate inventory or POs.
 */
import { scaleIngredientQuantity } from '../recipes/scaling.js';

export interface NetRequirementInput {
  grossRequirement: number;
  onHandQuantity: number;
  openPoQuantity: number;
  safetyStockQuantity: number;
}

export interface NetRequirementResult {
  netRequirement: number;
  shortageQuantity: number;
  recommendedPurchaseQty: number;
}

/** Convert case quantity to SKU units using containers per case. */
export function casesToUnits(cases: number, containersPerCase: number): number {
  if (cases < 0) throw new Error('Case quantity cannot be negative.');
  if (containersPerCase <= 0) throw new Error('Containers per case must be positive.');
  return cases * containersPerCase;
}

/** Convert SKU units to whole-case equivalent (may be fractional). */
export function unitsToCases(units: number, containersPerCase: number): number {
  if (units < 0) throw new Error('Unit quantity cannot be negative.');
  if (containersPerCase <= 0) throw new Error('Containers per case must be positive.');
  return units / containersPerCase;
}

/** Normalize demand to base units (each/bottle). */
export function normalizeDemandToUnits(
  quantity: number,
  unit: 'units' | 'cases',
  containersPerCase: number,
): number {
  return unit === 'cases' ? casesToUnits(quantity, containersPerCase) : quantity;
}

/**
 * Net requirement = gross + safety stock − on hand − open PO (floored at zero).
 * Shortage and purchase recommendation equal net when positive.
 */
export function computeNetRequirement(input: NetRequirementInput): NetRequirementResult {
  const {
    grossRequirement,
    onHandQuantity,
    openPoQuantity,
    safetyStockQuantity,
  } = input;
  const net = Math.max(
    0,
    grossRequirement + safetyStockQuantity - onHandQuantity - openPoQuantity,
  );
  return {
    netRequirement: net,
    shortageQuantity: net,
    recommendedPurchaseQty: net,
  };
}

export interface RecipeIngredientLine {
  rawMaterialId: number | null;
  packagingMaterialId: number | null;
  ingredientType: string;
  quantity: number;
  unit: string;
  quantityBasis: string;
  optional?: boolean;
}

export interface ScaledMaterialRequirement {
  materialType: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL';
  rawMaterialId: number | null;
  packagingMaterialId: number | null;
  grossRequirement: number;
  unit: string;
}

/** Explode scaled recipe ingredients for a target production quantity in units. */
export function explodeRecipeMaterialRequirements(input: {
  ingredients: RecipeIngredientLine[];
  baseBatchOutputUnits: number;
  targetOutputUnits: number;
}): ScaledMaterialRequirement[] {
  const { ingredients, baseBatchOutputUnits, targetOutputUnits } = input;
  if (baseBatchOutputUnits <= 0) throw new Error('Base batch output units must be positive.');
  const byKey = new Map<string, ScaledMaterialRequirement>();

  for (const line of ingredients) {
    if (line.optional) continue;
    const scaledQty = scaleIngredientQuantity(
      line.quantity,
      baseBatchOutputUnits,
      targetOutputUnits,
    );
    const materialType = line.packagingMaterialId != null ? 'PACKAGING_MATERIAL' : 'RAW_MATERIAL';
    const key = `${materialType}:${line.rawMaterialId ?? ''}:${line.packagingMaterialId ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.grossRequirement += scaledQty;
    } else {
      byKey.set(key, {
        materialType,
        rawMaterialId: line.rawMaterialId,
        packagingMaterialId: line.packagingMaterialId,
        grossRequirement: scaledQty,
        unit: line.unit,
      });
    }
  }
  return [...byKey.values()];
}

export interface ScheduleSlot {
  id: number;
  floorEquipmentId: number;
  scheduledStart: string;
  scheduledEnd: string;
  label?: string;
}

export interface ResourceConflict {
  slotAId: number;
  slotBId: number;
  floorEquipmentId: number;
  overlapStart: string;
  overlapEnd: string;
}

function parseScheduleInstant(value: string): number {
  return new Date(value).getTime();
}

/** Detect overlapping schedule slots on the same equipment (advisory only). */
export function detectResourceConflicts(slots: ScheduleSlot[]): ResourceConflict[] {
  const conflicts: ResourceConflict[] = [];
  const sorted = [...slots].sort(
    (a, b) => parseScheduleInstant(a.scheduledStart) - parseScheduleInstant(b.scheduledStart),
  );

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (a.floorEquipmentId !== b.floorEquipmentId) continue;
      const aStart = parseScheduleInstant(a.scheduledStart);
      const aEnd = parseScheduleInstant(a.scheduledEnd);
      const bStart = parseScheduleInstant(b.scheduledStart);
      const bEnd = parseScheduleInstant(b.scheduledEnd);
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push({
          slotAId: a.id,
          slotBId: b.id,
          floorEquipmentId: a.floorEquipmentId,
          overlapStart: new Date(Math.max(aStart, bStart)).toISOString(),
          overlapEnd: new Date(Math.min(aEnd, bEnd)).toISOString(),
        });
      }
    }
  }
  return conflicts;
}
