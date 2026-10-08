import { abvExceedsLimit } from './abv-limits';
import {
  isVolumeUnit,
  isWeightUnit,
  spiritVolumeGalFromAmount,
  toGallonsFromVolumeUnit,
  toLbs,
} from './blending';
import {
  RECIPE_EXPORT_BASE_HEADERS,
  RECIPE_INGREDIENT_ROLES,
  type RecipeIngredientRole,
} from './recipe-export';
import { parseCsv } from './reporting/csv';
import { knownNutrientUnit } from './wash-recipe-nutrients';
import type {
  BlendIngredientInput,
  BlendIngredientType,
  BlendRecipeSourceType,
  BlendRecipeSpiritSourceInput,
  RecipeNutrientInput,
} from '../types';

const ADDITIVE_ROLES = new Set<RecipeIngredientRole>(['water', 'sugar', 'syrup', 'flavoring', 'color', 'other']);
const BOTANICAL_UNITS = new Set(['g', 'kg', 'lbs', 'oz']);

const ROLE_PATTERN = new RegExp(
  `^(.*) \\((${RECIPE_INGREDIENT_ROLES.join('|')})\\)(?: \\d+)?$`,
  'i',
);

export interface ImportedWashRecipe {
  name: string;
  spirit_type: string;
  grain_type: string;
  grain_lbs: number;
  water_gal: number;
  yeast_strain: string;
  yeast_lbs: number;
  target_brix: number | null;
  target_final_brix: number | null;
  notes: string;
  nutrients: RecipeNutrientInput[];
}

export interface ImportedGinRecipe {
  name: string;
  notes: string;
  botanicals: { name: string; amount: number; weight: number; weight_unit: string }[];
}

export interface ImportedBlendRecipe {
  name: string;
  product_name: string;
  target_abv: number | null;
  target_brix: number | null;
  target_sugar_g_per_l: number | null;
  target_volume_gal: number | null;
  scale_factor: number;
  source_type: BlendRecipeSourceType;
  notes: string;
  spirit_sources: BlendRecipeSpiritSourceInput[];
  ingredients: BlendIngredientInput[];
}

export interface ImportedRecipeFile {
  wash: ImportedWashRecipe[];
  gin: ImportedGinRecipe[];
  blend: ImportedBlendRecipe[];
  errors: string[];
}

interface ParsedAmount {
  amount: number;
  unit: string;
  abv: number | null;
}

export function parseRecipeIngredientHeader(header: string): { name: string; role: RecipeIngredientRole } | null {
  const match = header.trim().match(ROLE_PATTERN);
  if (!match) return null;
  const role = match[2].toLowerCase() as RecipeIngredientRole;
  const name = match[1].trim();
  if (!name || !RECIPE_INGREDIENT_ROLES.includes(role)) return null;
  return { name, role };
}

function canonicalUnit(unit: string): string {
  const key = unit.trim().toLowerCase();
  if (['l', 'liter', 'liters', 'litre', 'litres'].includes(key)) return 'l';
  if (['gal', 'gallon', 'gallons'].includes(key)) return 'gal';
  if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(key)) return 'ml';
  if (['lb', 'lbs', 'pound', 'pounds'].includes(key)) return 'lbs';
  if (['g', 'gram', 'grams'].includes(key)) return 'g';
  if (['kg', 'kilogram', 'kilograms'].includes(key)) return 'kg';
  if (['oz', 'ounce', 'ounces'].includes(key)) return 'oz';
  if (['fl oz', 'floz', 'fl. oz'].includes(key)) return 'fl oz';
  if (key === 'each') return 'each';
  return unit.trim();
}

export function parseRecipeAmount(cell: string): ParsedAmount | null {
  const match = cell.trim().match(/^(-?\d+(?:\.\d+)?)\s+(.+?)(?:\s+@\s+(\d+(?:\.\d+)?)\s*%)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const abv = match[3] == null ? null : Number(match[3]);
  if (abv != null && !Number.isFinite(abv)) return null;
  return { amount, unit: canonicalUnit(match[2]), abv };
}

function headerIndex(headers: string[], name: string): number {
  return headers.findIndex((header) => header.trim().toLowerCase() === name.toLowerCase());
}

function cell(headers: string[], row: string[], name: string): string {
  const index = headerIndex(headers, name);
  if (index < 0) return '';
  return (row[index] ?? '').trim();
}

function optionalNumber(raw: string, label: string, errors: string[]): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    errors.push(`${label} must be a number.`);
    return null;
  }
  return value;
}

function emptyImported(): ImportedRecipeFile {
  return { wash: [], gin: [], blend: [], errors: [] };
}

export function importRecipeCsv(csv: string): ImportedRecipeFile {
  const table = parseCsv(csv);
  const result = emptyImported();
  if (table.length === 0) {
    result.errors.push('The file has no rows.');
    return result;
  }
  const headers = table[0].map((header) => header.trim());
  if (headerIndex(headers, 'Kind') < 0 || headerIndex(headers, 'Name') < 0) {
    result.errors.push('The CSV needs a Kind column and a Name column. Export recipes from this page, then import that file.');
    return result;
  }

  const base = new Set(RECIPE_EXPORT_BASE_HEADERS.map((header) => header.toLowerCase()));
  const ingredientColumns = headers
    .map((header, index) => ({ header, index }))
    .filter((column) => column.header && !base.has(column.header.toLowerCase()));

  if (table.length === 1) {
    result.errors.push('The file has no recipes.');
    return result;
  }

  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const row = table[rowIndex];
    const where = `Row ${rowIndex + 1}`;
    const kind = cell(headers, row, 'Kind').toLowerCase();
    const name = cell(headers, row, 'Name');
    const rowErrors: string[] = [];
    if (!name) rowErrors.push(`${where}: enter a recipe name.`);
    if (kind !== 'wash' && kind !== 'gin' && kind !== 'blend') {
      rowErrors.push(`${where}: Kind must be Wash, Gin, or Blend.`);
    }
    if (rowErrors.length > 0) {
      result.errors.push(...rowErrors);
      continue;
    }

    const ingredients: { name: string; role: RecipeIngredientRole; amount: ParsedAmount }[] = [];
    for (const column of ingredientColumns) {
      const raw = (row[column.index] ?? '').trim();
      if (!raw) continue;
      const parsedHeader = parseRecipeIngredientHeader(column.header);
      if (!parsedHeader) {
        rowErrors.push(`${where}: column "${column.header}" needs a role, such as ${column.header} (wash sugar).`);
        continue;
      }
      const amount = parseRecipeAmount(raw);
      if (!amount || !(amount.amount > 0)) {
        rowErrors.push(`${where}: could not read the amount in ${column.header}.`);
        continue;
      }
      if (amount.abv != null && abvExceedsLimit(amount.abv)) {
        rowErrors.push(`${where}: ${parsedHeader.name} ABV cannot be over 99%.`);
      }
      ingredients.push({ ...parsedHeader, amount });
    }

    if (kind === 'wash') {
      const wash = readWash(where, name, headers, row, ingredients, rowErrors);
      if (rowErrors.length === 0 && wash) result.wash.push(wash);
    } else if (kind === 'gin') {
      const gin = readGin(where, name, headers, row, ingredients, rowErrors);
      if (rowErrors.length === 0 && gin) result.gin.push(gin);
    } else if (kind === 'blend') {
      const blend = readBlend(where, name, headers, row, ingredients, rowErrors);
      if (rowErrors.length === 0 && blend) result.blend.push(blend);
    }
    if (rowErrors.length > 0) result.errors.push(...rowErrors);
  }

  if (result.wash.length + result.gin.length + result.blend.length === 0 && result.errors.length === 0) {
    result.errors.push('The file has no recipes.');
  }
  return result;
}

function readWash(
  where: string,
  name: string,
  headers: string[],
  row: string[],
  ingredients: { name: string; role: RecipeIngredientRole; amount: ParsedAmount }[],
  errors: string[],
): ImportedWashRecipe | null {
  let grainType = '';
  let grainLbs = 0;
  let waterGal = 0;
  let yeastStrain = '';
  let yeastLbs = 0;
  const nutrients: RecipeNutrientInput[] = [];
  for (const ingredient of ingredients) {
    if (ingredient.role === 'wash sugar') {
      if (grainLbs > 0) {
        errors.push(`${where}: a wash recipe can only have one sugar.`);
        continue;
      }
      if (!isWeightUnit(ingredient.amount.unit)) {
        errors.push(`${where}: ${ingredient.name} must be a weight, such as lbs.`);
        continue;
      }
      grainType = ingredient.name;
      grainLbs = toLbs(ingredient.amount.amount, ingredient.amount.unit);
    } else if (ingredient.role === 'wash water') {
      if (waterGal > 0) {
        errors.push(`${where}: a wash recipe can only have one water amount.`);
        continue;
      }
      const gallons = toGallonsFromVolumeUnit(ingredient.amount.amount, ingredient.amount.unit);
      if (!(gallons > 0)) {
        errors.push(`${where}: ${ingredient.name} must be a volume, such as gal or L.`);
        continue;
      }
      waterGal = gallons;
    } else if (ingredient.role === 'wash yeast') {
      if (yeastLbs > 0) {
        errors.push(`${where}: a wash recipe can only have one yeast.`);
        continue;
      }
      if (!isWeightUnit(ingredient.amount.unit)) {
        errors.push(`${where}: ${ingredient.name} must be a weight, such as lbs.`);
        continue;
      }
      yeastStrain = ingredient.name;
      yeastLbs = toLbs(ingredient.amount.amount, ingredient.amount.unit);
    } else if (ingredient.role === 'nutrient') {
      const unit = knownNutrientUnit(ingredient.amount.unit);
      if (!unit) {
        errors.push(`${where}: ${ingredient.name} needs a unit such as lbs, g, or ml.`);
        continue;
      }
      nutrients.push({
        name: ingredient.name,
        amount: ingredient.amount.amount,
        unit,
        inventory_item_id: null,
        notes: '',
      });
    } else {
      errors.push(`${where}: ${ingredient.name} (${ingredient.role}) does not belong on a wash recipe.`);
    }
  }
  const targetBrix = optionalNumber(cell(headers, row, 'Target start brix'), `${where}: Target start brix`, errors);
  const targetFinalBrix = optionalNumber(cell(headers, row, 'Target final brix'), `${where}: Target final brix`, errors);
  if (errors.length > 0) return null;
  return {
    name,
    spirit_type: cell(headers, row, 'Spirit type'),
    grain_type: grainType,
    grain_lbs: grainLbs,
    water_gal: waterGal,
    yeast_strain: yeastStrain,
    yeast_lbs: yeastLbs,
    target_brix: targetBrix,
    target_final_brix: targetFinalBrix,
    notes: cell(headers, row, 'Notes'),
    nutrients,
  };
}

function readGin(
  where: string,
  name: string,
  headers: string[],
  row: string[],
  ingredients: { name: string; role: RecipeIngredientRole; amount: ParsedAmount }[],
  errors: string[],
): ImportedGinRecipe | null {
  const botanicals: ImportedGinRecipe['botanicals'] = [];
  for (const ingredient of ingredients) {
    if (ingredient.role !== 'botanical') {
      errors.push(`${where}: ${ingredient.name} (${ingredient.role}) does not belong on a gin recipe.`);
      continue;
    }
    const unit = knownNutrientUnit(ingredient.amount.unit);
    if (!unit || !BOTANICAL_UNITS.has(unit)) {
      errors.push(`${where}: ${ingredient.name} must be a weight, such as g or lbs.`);
      continue;
    }
    botanicals.push({
      name: ingredient.name,
      amount: 0,
      weight: ingredient.amount.amount,
      weight_unit: unit,
    });
  }
  if (botanicals.length === 0) errors.push(`${where}: add at least one botanical with a weight.`);
  if (errors.length > 0) return null;
  return { name, notes: cell(headers, row, 'Notes'), botanicals };
}

function readBlend(
  where: string,
  name: string,
  headers: string[],
  row: string[],
  ingredients: { name: string; role: RecipeIngredientRole; amount: ParsedAmount }[],
  errors: string[],
): ImportedBlendRecipe | null {
  const spiritSources: BlendRecipeSpiritSourceInput[] = [];
  const additives: BlendIngredientInput[] = [];
  const targetAbv = optionalNumber(cell(headers, row, 'Target ABV %'), `${where}: Target ABV %`, errors);
  if (abvExceedsLimit(targetAbv)) errors.push(`${where}: Target ABV cannot be over 99%.`);
  for (const ingredient of ingredients) {
    if (ingredient.role === 'spirit') {
      const { amount, unit, abv } = ingredient.amount;
      if (!isVolumeUnit(unit) && !isWeightUnit(unit)) {
        errors.push(`${where}: ${ingredient.name} needs a volume or weight unit.`);
        continue;
      }
      if (unit === 'each') {
        errors.push(`${where}: ${ingredient.name} needs a volume or weight unit.`);
        continue;
      }
      if (isWeightUnit(unit) && !(abv != null && abv > 0)) {
        errors.push(`${where}: ${ingredient.name} needs an ABV to convert its weight to gallons.`);
        continue;
      }
      const volumeGal = spiritVolumeGalFromAmount(amount, unit, abv ?? 0);
      if (!(volumeGal > 0)) {
        errors.push(`${where}: ${ingredient.name} did not convert to a volume.`);
        continue;
      }
      spiritSources.push({
        spirit_label: ingredient.name,
        volume_gal: volumeGal,
        abv: abv ?? 0,
        barrel_id: null,
        entered_amount: amount,
        entered_unit: unit,
      });
    } else if (ADDITIVE_ROLES.has(ingredient.role)) {
      if (!isVolumeUnit(ingredient.amount.unit) && !isWeightUnit(ingredient.amount.unit)) {
        errors.push(`${where}: ${ingredient.name} needs a unit such as gal, ml, or lbs.`);
        continue;
      }
      additives.push({
        ingredient_type: ingredient.role as BlendIngredientType,
        name: ingredient.name,
        amount: ingredient.amount.amount,
        unit: ingredient.amount.unit,
        abv: ingredient.amount.abv,
        notes: '',
      });
    } else {
      errors.push(`${where}: ${ingredient.name} (${ingredient.role}) does not belong on a blend recipe.`);
    }
  }
  const scaleRaw = cell(headers, row, 'Scale');
  const scale = scaleRaw ? Number(scaleRaw) : 1;
  if (!Number.isFinite(scale) || scale <= 0) errors.push(`${where}: Scale must be a number greater than 0.`);
  const targetBrix = optionalNumber(cell(headers, row, 'Target brix'), `${where}: Target brix`, errors);
  const targetSugar = optionalNumber(cell(headers, row, 'Target sugar g/L'), `${where}: Target sugar g/L`, errors);
  const targetVolume = optionalNumber(cell(headers, row, 'Target volume gal'), `${where}: Target volume gal`, errors);
  const source = cell(headers, row, 'Source').toLowerCase();
  if (errors.length > 0) return null;
  return {
    name,
    product_name: cell(headers, row, 'Product'),
    target_abv: targetAbv,
    target_brix: targetBrix,
    target_sugar_g_per_l: targetSugar,
    target_volume_gal: targetVolume,
    scale_factor: scale,
    source_type: source === 'barrel' ? 'barrel' : 'tank',
    notes: cell(headers, row, 'Notes'),
    spirit_sources: spiritSources,
    ingredients: additives,
  };
}
