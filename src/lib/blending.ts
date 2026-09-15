import type { BlendIngredientInput, BlendIngredientType, InventoryItem } from '../types';
import { ML_PER_GALLON } from '../types';
import { proofFromAbv, weightFromWineGallons, wineGallonsFromWeight } from '../services/spirit-gauging';

export type MeasureMode = 'weight' | 'volume';

export const BLEND_INGREDIENT_TYPES: { value: BlendIngredientType; label: string }[] = [
  { value: 'water', label: 'Proofing water' },
  { value: 'sugar', label: 'Sugar' },
  { value: 'syrup', label: 'Syrup' },
  { value: 'flavoring', label: 'Flavoring' },
  { value: 'color', label: 'Color' },
  { value: 'other', label: 'Other additive' },
];

export const WEIGHT_UNITS = ['lbs', 'oz', 'kg', 'g'] as const;
export const VOLUME_UNITS = ['gal', 'fl oz', 'ml', 'l'] as const;

/**
 * Bulk density (g/ml) for converting weight → displaced liquid volume.
 * Sugar and CS1 syrup values from Liqour Blending FINAL (003).xlsx.
 */
const BULK_DENSITY_G_PER_ML: Record<BlendIngredientType, number> = {
  water: 1.0,
  sugar: 1.59,
  syrup: 1.368,
  flavoring: 1.0,
  color: 1.0,
  other: 1.0,
};

function lbsPerGallonFromDensity(densityGPerMl: number): number {
  return (ML_PER_GALLON * densityGPerMl) / 453.592;
}

/** Approximate bulk density for converting weight → liquid volume added. */
const LBS_PER_GALLON: Record<BlendIngredientType, number> = {
  water: 8.34,
  sugar: lbsPerGallonFromDensity(BULK_DENSITY_G_PER_ML.sugar),
  syrup: lbsPerGallonFromDensity(BULK_DENSITY_G_PER_ML.syrup),
  flavoring: lbsPerGallonFromDensity(BULK_DENSITY_G_PER_ML.flavoring),
  color: lbsPerGallonFromDensity(BULK_DENSITY_G_PER_ML.color),
  other: lbsPerGallonFromDensity(BULK_DENSITY_G_PER_ML.other),
};

export interface MeasureRecommendation {
  mode: MeasureMode;
  label: string;
  reason: string;
}

export const SPIRIT_MEASURE_RECOMMENDATION: MeasureRecommendation = {
  mode: 'volume',
  label: 'Measure by volume',
  reason: 'Spirit in holding tanks is tracked by the gallon — use tank gauges, sight glasses, or a flow meter.',
};

export const MEASURE_RECOMMENDATIONS: Record<BlendIngredientType, MeasureRecommendation> = {
  water: {
    mode: 'volume',
    label: 'Measure by volume',
    reason: 'Water is added with a flow meter, graduated tank, or measuring container.',
  },
  sugar: {
    mode: 'weight',
    label: 'Weigh on a scale',
    reason: 'Dry sugar packs differently in cups — a scale gives consistent sweetness every batch.',
  },
  syrup: {
    mode: 'weight',
    label: 'Weigh on a scale',
    reason: 'Thick syrup sticks to containers; weighing is more accurate than pouring to a line.',
  },
  flavoring: {
    mode: 'volume',
    label: 'Measure by volume',
    reason: 'Liquid flavorings are usually dosed with beakers, pumps, or syringes.',
  },
  color: {
    mode: 'volume',
    label: 'Measure by volume',
    reason: 'Colorants are added in small, precise liquid amounts.',
  },
  other: {
    mode: 'volume',
    label: 'Measure by volume',
    reason: 'Use volume for liquids; switch to weight if you are adding a dry ingredient.',
  },
};

export const BLEND_STATUSES = ['draft', 'trial', 'approved', 'executed', 'bottled'] as const;

export const BLEND_FORMULATION_PHASES = [
  { value: 'theoretical', label: 'Theoretical' },
  { value: 'trial', label: 'Lab trial' },
  { value: 'production', label: 'Production batch' },
] as const;

/** @deprecated Prefer unitsForMeasureMode — kept for compatibility. */
export const INGREDIENT_UNITS: Record<BlendIngredientType, string[]> = {
  water: ['gal', 'fl oz', 'ml'],
  sugar: ['lbs', 'oz', 'kg'],
  syrup: ['lbs', 'oz', 'gal', 'ml'],
  flavoring: ['gal', 'fl oz', 'ml', 'oz'],
  color: ['ml', 'fl oz', 'oz'],
  other: ['gal', 'lbs', 'oz', 'fl oz', 'ml', 'each'],
};

export function isWeightUnit(unit: string): boolean {
  return WEIGHT_UNITS.includes(unit.toLowerCase() as typeof WEIGHT_UNITS[number]);
}

export function isVolumeUnit(unit: string): boolean {
  const u = unit.toLowerCase();
  return VOLUME_UNITS.includes(u as typeof VOLUME_UNITS[number]) || u === 'each';
}

export function inferMeasureMode(unit: string): MeasureMode {
  if (isWeightUnit(unit)) return 'weight';
  return 'volume';
}

export function recommendMeasureMode(type: BlendIngredientType): MeasureRecommendation {
  return MEASURE_RECOMMENDATIONS[type];
}

export function unitsForMeasureMode(type: BlendIngredientType, mode: MeasureMode): string[] {
  if (mode === 'weight') {
    if (type === 'water') return ['lbs', 'oz', 'kg'];
    if (type === 'color') return ['oz', 'g', 'lbs'];
    return ['lbs', 'oz', 'kg', 'g'];
  }
  if (type === 'sugar') return ['gal', 'ml', 'fl oz'];
  if (type === 'syrup') return ['gal', 'ml', 'fl oz'];
  if (type === 'color') return ['ml', 'fl oz'];
  return ['gal', 'fl oz', 'ml', 'l'];
}

const NON_BLEND_INVENTORY_CATEGORIES = new Set([
  'packaging',
  'bottles',
  'labels',
  'barrels',
  'yeast',
]);

/** Preferred inventory categories for each blend additive type (water excluded). */
export function inventoryCategoriesForBlendType(type: BlendIngredientType): string[] {
  switch (type) {
    case 'sugar':
      return ['sugar'];
    case 'syrup':
      return ['sugar', 'syrup'];
    case 'flavoring':
      return ['flavoring', 'other'];
    case 'color':
      return ['color', 'other'];
    case 'other':
      return ['other'];
    default:
      return [];
  }
}

export function filterInventoryForBlendIngredient(
  items: InventoryItem[],
  type: BlendIngredientType,
): InventoryItem[] {
  if (type === 'water') return [];
  const categories = inventoryCategoriesForBlendType(type);
  const filtered = items.filter((item) => categories.includes(item.category.toLowerCase()));
  if (filtered.length > 0) return filtered;
  return items.filter((item) => !NON_BLEND_INVENTORY_CATEGORIES.has(item.category.toLowerCase()));
}

/** Unit choices for a blend additive row, always including the current unit. */
export function unitOptionsForBlendIngredient(
  ingredient: Pick<BlendIngredientInput, 'ingredient_type' | 'unit'>,
): string[] {
  const mode = inferMeasureMode(ingredient.unit);
  const options = unitsForMeasureMode(ingredient.ingredient_type, mode);
  if (ingredient.unit && !options.includes(ingredient.unit)) {
    return [ingredient.unit, ...options];
  }
  return options;
}

export function spiritUnitsForMeasureMode(mode: MeasureMode): string[] {
  return mode === 'weight' ? ['lbs', 'oz', 'kg'] : ['gal', 'fl oz', 'ml', 'l'];
}

export function spiritDefaultUnit(mode: MeasureMode): string {
  return spiritUnitsForMeasureMode(mode)[0];
}

/** Approximate spirit density (g/ml) from ABV — valid for unsugared spirits. */
export function spiritDensityGPerMl(abv: number): number {
  return 0.79 + abv * 0.0011;
}

/** TTB Table No. 3 lb/US wine gal at the given ABV (percent). */
export function spiritLbsPerGallon(abv: number): number {
  if (abv <= 0) return 8.34;
  return weightFromWineGallons(1, proofFromAbv(abv));
}

export function spiritVolumeGalFromAmount(amount: number, unit: string, abv: number): number {
  if (amount <= 0) return 0;
  if (isVolumeUnit(unit)) return toGallonsFromVolumeUnit(amount, unit);
  if (isWeightUnit(unit)) {
    const lbs = toLbs(amount, unit);
    if (abv <= 0) return 0;
    return wineGallonsFromWeight(lbs, proofFromAbv(abv));
  }
  return 0;
}

/** Net weight (lb) for a wine-gallon spirit volume at ABV % via TTB Table No. 3. */
export function spiritWeightLbsFromVolumeGal(volumeGal: number, abv: number): number {
  if (volumeGal <= 0 || abv <= 0) return 0;
  return weightFromWineGallons(volumeGal, proofFromAbv(abv));
}

export function formatSpiritPullWeightLbs(volumeGal: number, abv: number): string | null {
  const lbs = spiritWeightLbsFromVolumeGal(volumeGal, abv);
  if (lbs <= 0) return null;
  return lbs >= 10 ? `${lbs.toFixed(1)} lbs` : `${lbs.toFixed(2)} lbs`;
}

export function formatBlendRecipeSpiritPull(
  label: string,
  volumeGal: number,
  abv: number,
): string {
  const name = label.trim() || 'Spirit';
  const volume = `${volumeGal.toFixed(1)} gal @ ${abv.toFixed(1)}%`;
  const weight = formatSpiritPullWeightLbs(volumeGal, abv);
  return weight ? `${name}: ${weight} · ${volume}` : `${name}: ${volume}`;
}

function formatAdditiveWeightLbs(lbs: number): string | null {
  if (lbs <= 0) return null;
  return lbs >= 10 ? `${lbs.toFixed(1)} lbs` : `${lbs.toFixed(2)} lbs`;
}

function formatAdditiveVolumeGal(gal: number): string | null {
  if (gal <= 0) return null;
  const liters = gal * ML_PER_GALLON / 1000;
  const galLabel = `${gal.toFixed(2)} gal`;
  return liters >= 1 ? `${galLabel} (${liters.toFixed(1)} L)` : galLabel;
}

/** Recipe display: primary amount plus weight/volume equivalent for additives. */
export function formatBlendRecipeAdditive(
  ingredient: Pick<BlendIngredientInput, 'amount' | 'unit' | 'name' | 'ingredient_type'>,
): string {
  const name = (ingredient.name || ingredient.ingredient_type).trim();
  const primary = `${ingredient.amount} ${ingredient.unit}`.trim();
  if (ingredient.amount <= 0) return `${name}: ${primary}`;

  if (isWeightUnit(ingredient.unit)) {
    const volume = formatAdditiveVolumeGal(ingredientVolumeGal(ingredient));
    return volume ? `${name}: ${primary} · ${volume}` : `${name}: ${primary}`;
  }

  if (isVolumeUnit(ingredient.unit)) {
    const weight = formatAdditiveWeightLbs(ingredientWeightLbs(ingredient));
    return weight ? `${name}: ${primary} · ${weight}` : `${name}: ${primary}`;
  }

  return `${name}: ${primary}`;
}

export function spiritMeasureAlternate(amount: number, unit: string, abv: number): MeasureAlternate | null {
  if (amount <= 0 || abv <= 0) return null;

  if (isWeightUnit(unit)) {
    const gal = spiritVolumeGalFromAmount(amount, unit, abv);
    if (gal <= 0) return null;
    const liters = gal * ML_PER_GALLON / 1000;
    const galLabel = `≈ ${gal.toFixed(2)} gal at ${abv.toFixed(1)}% ABV`;
    const label = liters >= 1 ? `${galLabel} (${liters.toFixed(1)} L)` : galLabel;
    return { amount: Math.round(gal * 100) / 100, unit: 'gal', label };
  }

  if (isVolumeUnit(unit)) {
    const gal = toGallonsFromVolumeUnit(amount, unit);
    const lbs = spiritWeightLbsFromVolumeGal(gal, abv);
    if (lbs <= 0) return null;
    if (lbs < 1) {
      const oz = lbs * 16;
      return { amount: Math.round(oz * 10) / 10, unit: 'oz', label: `≈ ${oz.toFixed(1)} oz on a scale` };
    }
    return { amount: Math.round(lbs * 100) / 100, unit: 'lbs', label: `≈ ${lbs.toFixed(2)} lbs on a scale` };
  }

  return null;
}

export function formatSpiritCorrectionWithAlternate(
  amountGal: number,
  abv: number,
  baseInstruction: string,
): string {
  const lbs = spiritWeightLbsFromVolumeGal(amountGal, abv);
  if (lbs <= 0) return baseInstruction;
  const weightNote = lbs >= 1
    ? `≈ ${lbs.toFixed(2)} lbs on a scale`
    : `≈ ${(lbs * 16).toFixed(1)} oz on a scale`;
  return `${baseInstruction} (${weightNote})`;
}

export function defaultUnitForMode(type: BlendIngredientType, mode: MeasureMode): string {
  const units = unitsForMeasureMode(type, mode);
  const rec = recommendMeasureMode(type);
  if (rec.mode === mode) return units[0];
  return units[0];
}

export function toLbs(amount: number, unit: string): number {
  if (amount <= 0) return 0;
  switch (unit.toLowerCase()) {
    case 'lbs':
      return amount;
    case 'oz':
      return amount / 16;
    case 'kg':
      return amount * 2.20462;
    case 'g':
      return amount / 453.592;
    default:
      return 0;
  }
}

export function toGallonsFromVolumeUnit(amount: number, unit: string): number {
  if (amount <= 0) return 0;
  switch (unit.toLowerCase()) {
    case 'gal':
      return amount;
    case 'ml':
      return amount / ML_PER_GALLON;
    case 'l':
      return amount * 0.264172;
    case 'fl oz':
    case 'floz':
      return amount / 128;
    default:
      return 0;
  }
}

export function ingredientWeightLbs(
  ingredient: Pick<BlendIngredientInput, 'amount' | 'unit' | 'ingredient_type'>,
): number {
  if (isWeightUnit(ingredient.unit)) {
    return toLbs(ingredient.amount, ingredient.unit);
  }
  const volGal = toGallonsFromVolumeUnit(ingredient.amount, ingredient.unit);
  if (volGal <= 0) return 0;
  return volGal * LBS_PER_GALLON[ingredient.ingredient_type];
}

export function ingredientPureAlcoholGal(
  ingredient: Pick<BlendIngredientInput, 'amount' | 'unit' | 'ingredient_type'> & { abv?: number | null },
): number {
  const abv = ingredient.abv ?? 0;
  if (abv <= 0) return 0;
  return ingredientVolumeGal(ingredient) * abv / 100;
}

export function ingredientVolumeGal(
  ingredient: Pick<BlendIngredientInput, 'amount' | 'unit' | 'ingredient_type'>,
): number {
  const { amount, unit, ingredient_type } = ingredient;
  if (amount <= 0) return 0;

  if (isVolumeUnit(unit)) {
    return toGallonsFromVolumeUnit(amount, unit);
  }

  if (isWeightUnit(unit)) {
    const lbs = toLbs(amount, unit);
    const lbsPerGal = LBS_PER_GALLON[ingredient_type] || 8.34;
    return lbs / lbsPerGal;
  }

  return 0;
}

export interface MeasureAlternate {
  amount: number;
  unit: string;
  label: string;
}

/** Show the equivalent in the other measure mode (e.g. lbs → gal). */
export function measureAlternate(
  ingredient: Pick<BlendIngredientInput, 'amount' | 'unit' | 'ingredient_type'>,
): MeasureAlternate | null {
  if (ingredient.amount <= 0) return null;

  if (isWeightUnit(ingredient.unit)) {
    const gal = ingredientVolumeGal(ingredient);
    if (gal <= 0) return null;
    const liters = gal * ML_PER_GALLON / 1000;
    const galLabel = `≈ ${gal.toFixed(2)} gal added volume`;
    const label = liters >= 1
      ? `${galLabel} (${liters.toFixed(1)} L)`
      : galLabel;
    return { amount: Math.round(gal * 100) / 100, unit: 'gal', label };
  }

  if (isVolumeUnit(ingredient.unit)) {
    const lbs = ingredientWeightLbs(ingredient);
    if (lbs <= 0) return null;
    if (lbs < 1) {
      const oz = lbs * 16;
      return { amount: Math.round(oz * 10) / 10, unit: 'oz', label: `≈ ${oz.toFixed(1)} oz by weight` };
    }
    return { amount: Math.round(lbs * 100) / 100, unit: 'lbs', label: `≈ ${lbs.toFixed(2)} lbs by weight` };
  }

  return null;
}

export function formatCorrectionWithAlternate(
  amount: number,
  unit: string,
  ingredientType: BlendIngredientType,
  baseInstruction: string,
): string {
  const alt = measureAlternate({ amount, unit, ingredient_type: ingredientType });
  if (!alt) return baseInstruction;
  return `${baseInstruction} (${alt.label})`;
}

export function computeBlendTotals(
  baseSpiritVolumeGal: number,
  baseSpiritAbv: number,
  ingredients: (BlendIngredientInput & { abv?: number | null })[],
): { finalVolumeGal: number; finalAbv: number } {
  const extraVolumeGal = ingredients.reduce(
    (sum, ing) => sum + ingredientVolumeGal(ing),
    0,
  );
  const additiveAlcoholGal = ingredients.reduce(
    (sum, ing) => sum + ingredientPureAlcoholGal(ing),
    0,
  );
  const finalVolumeGal = baseSpiritVolumeGal + extraVolumeGal;
  const baseGpa = baseSpiritVolumeGal * baseSpiritAbv / 100 + additiveAlcoholGal;
  const finalAbv = finalVolumeGal > 0 ? (baseGpa / finalVolumeGal) * 100 : 0;
  return {
    finalVolumeGal: Math.round(finalVolumeGal * 1000) / 1000,
    finalAbv: Math.round(finalAbv * 100) / 100,
  };
}

export function defaultIngredientUnit(type: BlendIngredientType): string {
  return defaultUnitForMode(type, recommendMeasureMode(type).mode);
}
