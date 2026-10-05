import type { BlendIngredientInput, BlendIngredientType, InventoryItem } from '../types';
import { ML_PER_GALLON } from '../types';
import { proofFromAbv, weightFromWineGallons, wineGallonsFromWeight } from '../services/spirit-gauging';
import { US_FL_OZ_PER_GALLON } from './unit-converter';
import {
  CLASS_I_CARAMEL_DENSITY_G_PER_ML,
  dissolvedSucroseLbsPerGallon,
  gPerMlFromLbsPerGallon,
  lbsPerGallonFromGPerMl,
  SYRUP_BULK_DENSITY_G_PER_ML,
  WATER_LBS_PER_US_GALLON,
} from './material-densities';

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
 * Pounds per gallon of volume each additive occupies in a blend.
 * Water is the TTB §30.41 factor. Sugar is dissolved apparent volume (0.6219 ml/g),
 * not sucrose crystal density. Syrup is the plant CS1 sheet. Color is class-typical
 * Class I caramel (SG 1.30), not a YT75 lot spec. Flavoring and other additives
 * with no published density are weighed as water unless they carry an ABV.
 */
const LBS_PER_GALLON: Record<BlendIngredientType, number> = {
  water: WATER_LBS_PER_US_GALLON,
  sugar: dissolvedSucroseLbsPerGallon(),
  syrup: lbsPerGallonFromGPerMl(SYRUP_BULK_DENSITY_G_PER_ML),
  flavoring: WATER_LBS_PER_US_GALLON,
  color: lbsPerGallonFromGPerMl(CLASS_I_CARAMEL_DENSITY_G_PER_ML),
  other: WATER_LBS_PER_US_GALLON,
};

type IngredientMeasure = Pick<BlendIngredientInput, 'amount' | 'unit' | 'ingredient_type'> & {
  abv?: number | null;
};

/** Flavoring, color, and other additives with an ABV are gauged on Table 3. */
function alcoholicGaugeAbv(ingredient: IngredientMeasure): number {
  const abv = ingredient.abv ?? 0;
  if (!(abv > 0)) return 0;
  if (ingredient.ingredient_type === 'sugar' || ingredient.ingredient_type === 'water') return 0;
  return abv;
}

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

/**
 * Density (g/ml) of an unsugared spirit from TTB Table No. 3 lb/gal.
 * Density falls as ABV rises. At 0% ABV this is the TTB water factor, not a hydrometer reading.
 */
export function spiritDensityGPerMl(abv: number): number {
  return gPerMlFromLbsPerGallon(spiritLbsPerGallon(abv));
}

/**
 * TTB Table No. 3 lb/US wine gal at the given ABV (percent).
 * Table 3 rounds proof gallons to 0.1, so the inverse of 1 gallon is coarse.
 * A 1,000 gallon basis keeps the pounds-per-gallon factor stable (93% is about 6.86, not 6.75).
 * Water at 0% uses 27 CFR §30.41.
 */
const SPIRIT_LBS_PER_GALLON_BASIS = 1000;

export function spiritLbsPerGallon(abv: number): number {
  if (abv <= 0) return WATER_LBS_PER_US_GALLON;
  return weightFromWineGallons(SPIRIT_LBS_PER_GALLON_BASIS, proofFromAbv(abv)) / SPIRIT_LBS_PER_GALLON_BASIS;
}

/** Amount in `unit` for a wine-gallon spirit pull. Inverse of spiritVolumeGalFromAmount. */
export function amountFromSpiritVolumeGal(volumeGal: number, unit: string, abv: number): number {
  if (!(volumeGal > 0)) return 0;
  if (isVolumeUnit(unit)) {
    let amount = volumeGal;
    switch (unit.toLowerCase()) {
      case 'ml':
        amount = volumeGal * ML_PER_GALLON;
        break;
      case 'l':
        amount = volumeGal / 0.264172;
        break;
      case 'fl oz':
      case 'floz':
        amount = volumeGal * 128;
        break;
      default:
        amount = volumeGal;
    }
    return Math.round(amount * 1000) / 1000;
  }
  if (isWeightUnit(unit)) {
    const lbs = spiritWeightLbsFromVolumeGal(volumeGal, abv);
    let amount = lbs;
    switch (unit.toLowerCase()) {
      case 'oz':
        amount = lbs * 16;
        break;
      case 'kg':
        amount = lbs / 2.20462;
        break;
      case 'g':
        amount = lbs * 453.592;
        break;
      default:
        amount = lbs;
    }
    return Math.round(amount * 100) / 100;
  }
  return Math.round(volumeGal * 1000) / 1000;
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

const KG_PER_LB = 1 / 2.2046226218;

function formatStepped(value: number, digits: number, unit: string): string {
  const rounded = Number(value.toFixed(digits));
  return `${rounded} ${unit}`;
}

/** Review line: gallons and liters, stepping down when a unit is below 1. */
export function formatReviewVolume(volumeGal: number): string {
  if (!(volumeGal > 0)) return '—';
  const liters = (volumeGal * ML_PER_GALLON) / 1000;
  if (volumeGal >= 1) {
    return `${volumeGal.toFixed(2)} gal · ${liters.toFixed(1)} L`;
  }
  const flOz = volumeGal * US_FL_OZ_PER_GALLON;
  const volume = flOz >= 1 ? formatStepped(flOz, 2, 'fl oz') : null;
  if (liters >= 1) {
    return volume ? `${volume} · ${liters.toFixed(1)} L` : `${liters.toFixed(1)} L`;
  }
  const ml = formatStepped(liters * 1000, 0, 'ml');
  return volume ? `${volume} · ${ml}` : ml;
}

/** Review line: pounds and kilograms, stepping down to grams when a unit is below 1. */
export function formatReviewWeight(weightLb: number): string {
  if (!(weightLb > 0)) return '—';
  const kg = weightLb * KG_PER_LB;
  if (weightLb >= 1 && kg >= 1) {
    return `${weightLb.toFixed(2)} lb · ${kg.toFixed(2)} kg`;
  }
  const grams = kg * 1000;
  const gramLabel = formatStepped(grams, grams >= 100 ? 0 : 1, 'g');
  if (weightLb >= 1) return `${weightLb.toFixed(2)} lb · ${gramLabel}`;
  return gramLabel;
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
  ingredient: Pick<BlendIngredientInput, 'amount' | 'unit' | 'name' | 'ingredient_type' | 'abv'>,
): string {
  const name = (ingredient.name || ingredient.ingredient_type).trim();
  const primary = `${ingredient.amount} ${ingredient.unit}`.trim();
  const abvNote = ingredient.abv != null && ingredient.abv > 0
    ? ` @ ${ingredient.abv}% ABV`
    : '';
  if (ingredient.amount <= 0) return `${name}: ${primary}${abvNote}`;

  if (isWeightUnit(ingredient.unit)) {
    const volume = formatAdditiveVolumeGal(ingredientVolumeGal(ingredient));
    return volume ? `${name}: ${primary}${abvNote} · ${volume}` : `${name}: ${primary}${abvNote}`;
  }

  if (isVolumeUnit(ingredient.unit)) {
    const weight = formatAdditiveWeightLbs(ingredientWeightLbs(ingredient));
    return weight ? `${name}: ${primary}${abvNote} · ${weight}` : `${name}: ${primary}${abvNote}`;
  }

  return `${name}: ${primary}${abvNote}`;
}

/** Liquid additives that may contribute alcohol (e.g. extract-based flavorings). */
export function additiveSupportsAbv(ingredientType: BlendIngredientType): boolean {
  return ingredientType === 'flavoring' || ingredientType === 'syrup';
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

const LB_PER_KG = 2.20462;
const G_PER_LB = 453.592;
const FL_OZ_PER_GALLON = 128;
const GALLONS_PER_LITER = 0.264172;

export function toLbs(amount: number, unit: string): number {
  if (amount <= 0) return 0;
  switch (unit.toLowerCase()) {
    case 'lbs':
      return amount;
    case 'oz':
      return amount / 16;
    case 'kg':
      return amount * LB_PER_KG;
    case 'g':
      return amount / G_PER_LB;
    default:
      return 0;
  }
}

export function lbsToUnit(lbs: number, unit: string): number {
  if (lbs <= 0) return 0;
  switch (unit.toLowerCase()) {
    case 'lbs':
      return lbs;
    case 'oz':
      return lbs * 16;
    case 'kg':
      return lbs / LB_PER_KG;
    case 'g':
      return lbs * G_PER_LB;
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
      return amount * GALLONS_PER_LITER;
    case 'fl oz':
    case 'floz':
      return amount / FL_OZ_PER_GALLON;
    default:
      return 0;
  }
}

export function gallonsToUnit(gallons: number, unit: string): number {
  if (gallons <= 0) return 0;
  switch (unit.toLowerCase()) {
    case 'gal':
      return gallons;
    case 'ml':
      return gallons * ML_PER_GALLON;
    case 'l':
      return gallons / GALLONS_PER_LITER;
    case 'fl oz':
    case 'floz':
      return gallons * FL_OZ_PER_GALLON;
    default:
      return 0;
  }
}

function roundMeasuredAmount(amount: number, unit: string): number {
  const places = unit.toLowerCase() === 'g' || unit.toLowerCase() === 'ml' ? 2 : 3;
  const factor = 10 ** places;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

function canConvertMeasureUnit(unit: string): boolean {
  return unit.toLowerCase() !== 'each' && (isWeightUnit(unit) || isVolumeUnit(unit));
}

/**
 * Same physical amount in another unit. Volume and mass use the additive density
 * already used for recipe weights (TTB water, dissolved sugar, syrup, color, Table 3 when ABV is set).
 */
export function convertIngredientAmount(ingredient: IngredientMeasure, toUnit: string): number {
  const fromUnit = ingredient.unit;
  if (fromUnit.toLowerCase() === toUnit.toLowerCase()) return ingredient.amount;
  if (!(ingredient.amount > 0)) return 0;
  if (!canConvertMeasureUnit(fromUnit) || !canConvertMeasureUnit(toUnit)) return ingredient.amount;

  if (isWeightUnit(toUnit)) {
    return roundMeasuredAmount(lbsToUnit(ingredientWeightLbs(ingredient), toUnit), toUnit);
  }
  return roundMeasuredAmount(gallonsToUnit(ingredientVolumeGal(ingredient), toUnit), toUnit);
}

/** Same spirit pull in another unit. Mass uses TTB Table 3 at the pull's ABV. */
export function convertSpiritAmount(amount: number, fromUnit: string, toUnit: string, abv: number): number {
  if (fromUnit.toLowerCase() === toUnit.toLowerCase()) return amount;
  if (!(amount > 0)) return 0;
  if (!canConvertMeasureUnit(fromUnit) || !canConvertMeasureUnit(toUnit)) return amount;

  const fromWeight = isWeightUnit(fromUnit);
  const toWeight = isWeightUnit(toUnit);
  if (fromWeight && toWeight) {
    return roundMeasuredAmount(lbsToUnit(toLbs(amount, fromUnit), toUnit), toUnit);
  }
  if (!fromWeight && !toWeight) {
    return roundMeasuredAmount(gallonsToUnit(toGallonsFromVolumeUnit(amount, fromUnit), toUnit), toUnit);
  }
  if (!(abv > 0)) return amount;
  const gallons = spiritVolumeGalFromAmount(amount, fromUnit, abv);
  if (!(gallons > 0)) return amount;
  return amountFromSpiritVolumeGal(gallons, toUnit, abv);
}

export function ingredientWeightLbs(ingredient: IngredientMeasure): number {
  if (isWeightUnit(ingredient.unit)) {
    return toLbs(ingredient.amount, ingredient.unit);
  }
  const volGal = toGallonsFromVolumeUnit(ingredient.amount, ingredient.unit);
  if (volGal <= 0) return 0;
  const abv = alcoholicGaugeAbv(ingredient);
  if (abv > 0) return spiritWeightLbsFromVolumeGal(volGal, abv);
  return volGal * LBS_PER_GALLON[ingredient.ingredient_type];
}

export function ingredientPureAlcoholGal(ingredient: IngredientMeasure): number {
  const abv = ingredient.abv ?? 0;
  if (abv <= 0) return 0;
  return ingredientVolumeGal(ingredient) * abv / 100;
}

export function ingredientVolumeGal(ingredient: IngredientMeasure): number {
  const { amount, unit, ingredient_type } = ingredient;
  if (amount <= 0) return 0;

  if (isVolumeUnit(unit)) {
    return toGallonsFromVolumeUnit(amount, unit);
  }

  if (isWeightUnit(unit)) {
    const lbs = toLbs(amount, unit);
    const abv = alcoholicGaugeAbv(ingredient);
    if (abv > 0) return wineGallonsFromWeight(lbs, proofFromAbv(abv));
    const lbsPerGal = LBS_PER_GALLON[ingredient_type] || WATER_LBS_PER_US_GALLON;
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
export function measureAlternate(ingredient: IngredientMeasure): MeasureAlternate | null {
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
