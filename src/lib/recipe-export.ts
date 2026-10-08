import { formatGallonDisplay } from './formulation-quantity';
import { LITERS_PER_US_GALLON, ML_PER_LITER } from './material-densities';
import type {
  BlendRecipeIngredient,
  BlendRecipeSpiritSource,
  BlendRecipeView,
  GinBotanicalInput,
  GinRecipe,
  RecipeNutrient,
  RecipeView,
} from '../types';

/** Recipe fields that stay one column per recipe. Ingredients are added after these. */
export const RECIPE_EXPORT_BASE_HEADERS = [
  'Kind',
  'Name',
  'Product',
  'Spirit type',
  'Target start brix',
  'Target final brix',
  'Target ABV %',
  'Target brix',
  'Target sugar g/L',
  'Target volume gal',
  'Scale',
  'Source',
  'Version',
  'Notes',
] as const;

export interface RecipeExportInput {
  wash?: RecipeView[];
  gin?: GinRecipe[];
  blend?: BlendRecipeView[];
}

export interface RecipeExportSheet {
  headers: string[];
  rows: (string | number)[][];
}

const LITER_UNITS = new Set(['l', 'liter', 'liters', 'litre', 'litres']);
const GALLON_UNITS = new Set(['gal', 'gallon', 'gallons']);
const ML_UNITS = new Set(['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres']);

function text(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function optionalNumber(value: number | null | undefined): number | '' {
  if (value == null) return '';
  return value;
}

/** Up to 3 decimal places, with trailing zeros removed. */
export function formatExportNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0) || rounded === 0) return '0';
  return rounded.toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function unitKey(unit: string | null | undefined): string {
  return (unit ?? '').trim().toLowerCase();
}

function exportUnitLabel(unit: string): string {
  const key = unitKey(unit);
  if (LITER_UNITS.has(key)) return 'L';
  if (GALLON_UNITS.has(key)) return 'gal';
  if (ML_UNITS.has(key)) return 'ml';
  if (key === 'lbs' || key === 'lb' || key === 'pound' || key === 'pounds') return 'lbs';
  if (key === 'g' || key === 'gram' || key === 'grams') return 'g';
  if (key === 'kg' || key === 'kilogram' || key === 'kilograms') return 'kg';
  if (key === 'oz' || key === 'ounce' || key === 'ounces') return 'oz';
  if (key === 'fl oz' || key === 'floz') return 'fl oz';
  return (unit ?? '').trim();
}

/**
 * Amount for a recipe CSV cell.
 * A liter quantity below 1 US gallon is written in milliliters: 1.256 L is 1256 ml.
 * A liter quantity of 1 gallon or more stays in liters. Gallons stay in gallons.
 */
export function formatRecipeExportAmount(amount: number, unit: string | null | undefined): string {
  if (!Number.isFinite(amount)) return '';
  const key = unitKey(unit);
  if (LITER_UNITS.has(key)) {
    const gallons = amount / LITERS_PER_US_GALLON;
    if (amount > 0 && gallons < 1) return `${formatExportNumber(amount * ML_PER_LITER)} ml`;
    return `${formatExportNumber(amount)} L`;
  }
  if (GALLON_UNITS.has(key)) {
    if (amount > 0 && amount < 1) return `${formatGallonDisplay(amount)} gal`;
    return `${formatExportNumber(amount)} gal`;
  }
  if (ML_UNITS.has(key)) return `${formatExportNumber(amount)} ml`;
  const label = exportUnitLabel(unit ?? '');
  return label ? `${formatExportNumber(amount)} ${label}` : formatExportNumber(amount);
}

function formatGallons(gallons: number): string {
  return formatRecipeExportAmount(gallons, 'gal');
}

function withAbv(amount: string, abv: number | null | undefined): string {
  if (!amount) return '';
  if (abv == null || !(abv > 0)) return amount;
  return `${amount} @ ${abv.toFixed(2)}%`;
}

function spiritAmount(source: BlendRecipeSpiritSource): string {
  const entered = source.entered_amount != null && source.entered_amount > 0 && text(source.entered_unit);
  if (!entered && !(source.volume_gal > 0)) return '';
  const amount = entered
    ? formatRecipeExportAmount(source.entered_amount!, source.entered_unit)
    : formatGallons(source.volume_gal);
  return withAbv(amount, source.abv);
}

function additiveAmount(ingredient: BlendRecipeIngredient): string {
  return withAbv(formatRecipeExportAmount(ingredient.amount, ingredient.unit), ingredient.abv);
}

function columnName(base: string, taken: Set<string>): string {
  const cleaned = base.trim() || 'Ingredient';
  if (!taken.has(cleaned)) return cleaned;
  let n = 2;
  let name = `${cleaned} ${n}`;
  while (taken.has(name)) {
    n += 1;
    name = `${cleaned} ${n}`;
  }
  return name;
}

interface BuiltRow {
  fixed: (string | number)[];
  ingredients: Map<string, string>;
}

function collectIngredient(
  columns: string[],
  reserved: Set<string>,
  rowUsed: Set<string>,
  name: string,
  value: string,
  into: Map<string, string>,
) {
  if (!value) return;
  // A repeated ingredient on this row gets its own numbered column. The same name on another recipe shares the first column.
  const header = columnName(name, new Set([...reserved, ...rowUsed]));
  rowUsed.add(header);
  if (!columns.includes(header)) columns.push(header);
  into.set(header, value);
}

function fixedValues(values: Partial<Record<(typeof RECIPE_EXPORT_BASE_HEADERS)[number], string | number>>): (string | number)[] {
  return RECIPE_EXPORT_BASE_HEADERS.map((header) => {
    const value = values[header];
    return value == null || value === '' ? '' : value;
  });
}

function addWashIngredients(
  recipe: RecipeView,
  columns: string[],
  reserved: Set<string>,
  into: Map<string, string>,
) {
  const rowUsed = new Set<string>();
  if (recipe.grain_lbs > 0) {
    collectIngredient(columns, reserved, rowUsed, text(recipe.grain_type) || 'Sugar', formatRecipeExportAmount(recipe.grain_lbs, 'lbs'), into);
  }
  if (recipe.water_gal > 0) {
    collectIngredient(columns, reserved, rowUsed, 'Water', formatGallons(recipe.water_gal), into);
  }
  if (recipe.yeast_lbs > 0) {
    collectIngredient(columns, reserved, rowUsed, text(recipe.yeast_strain) || 'Yeast', formatRecipeExportAmount(recipe.yeast_lbs, 'lbs'), into);
  }
  for (const nutrient of recipe.nutrients ?? []) addNutrient(nutrient, columns, reserved, rowUsed, into);
}

function addNutrient(
  nutrient: RecipeNutrient,
  columns: string[],
  reserved: Set<string>,
  rowUsed: Set<string>,
  into: Map<string, string>,
) {
  if (!(nutrient.amount > 0) || !text(nutrient.name)) return;
  collectIngredient(
    columns,
    reserved,
    rowUsed,
    nutrient.name,
    formatRecipeExportAmount(nutrient.amount, nutrient.unit),
    into,
  );
}

function addBotanical(
  botanical: GinBotanicalInput,
  columns: string[],
  reserved: Set<string>,
  rowUsed: Set<string>,
  into: Map<string, string>,
) {
  if (!(botanical.weight > 0) || !text(botanical.name)) return;
  collectIngredient(
    columns,
    reserved,
    rowUsed,
    botanical.name,
    formatRecipeExportAmount(botanical.weight, botanical.weight_unit),
    into,
  );
}

export function buildRecipeExport(input: RecipeExportInput): RecipeExportSheet {
  const columns: string[] = [];
  const reserved = new Set<string>(RECIPE_EXPORT_BASE_HEADERS);
  const built: BuiltRow[] = [];

  for (const recipe of input.wash ?? []) {
    const ingredients = new Map<string, string>();
    addWashIngredients(recipe, columns, reserved, ingredients);
    built.push({
      fixed: fixedValues({
        Kind: 'Wash',
        Name: recipe.name,
        'Spirit type': text(recipe.spirit_type),
        'Target start brix': optionalNumber(recipe.target_brix),
        'Target final brix': optionalNumber(recipe.target_final_brix),
        Notes: text(recipe.notes),
      }),
      ingredients,
    });
  }

  for (const recipe of input.gin ?? []) {
    const ingredients = new Map<string, string>();
    const rowUsed = new Set<string>();
    for (const botanical of recipe.botanicals ?? []) {
      addBotanical(botanical, columns, reserved, rowUsed, ingredients);
    }
    built.push({
      fixed: fixedValues({
        Kind: 'Gin',
        Name: recipe.name,
        Notes: text(recipe.notes),
      }),
      ingredients,
    });
  }

  for (const recipe of input.blend ?? []) {
    const ingredients = new Map<string, string>();
    const rowUsed = new Set<string>();
    for (const source of recipe.spirit_sources ?? []) {
      collectIngredient(
        columns,
        reserved,
        rowUsed,
        text(source.spirit_label) || 'Spirit',
        spiritAmount(source),
        ingredients,
      );
    }
    for (const ingredient of recipe.ingredients ?? []) {
      if (!(ingredient.amount > 0)) continue;
      const name = text(ingredient.name) || text(ingredient.ingredient_type) || 'Ingredient';
      collectIngredient(columns, reserved, rowUsed, name, additiveAmount(ingredient), ingredients);
    }
    built.push({
      fixed: fixedValues({
        Kind: 'Blend',
        Name: recipe.name,
        Product: text(recipe.product_name),
        'Target ABV %': optionalNumber(recipe.target_abv),
        'Target brix': optionalNumber(recipe.target_brix),
        'Target sugar g/L': optionalNumber(recipe.target_sugar_g_per_l),
        'Target volume gal': optionalNumber(recipe.target_volume_gal),
        Scale: recipe.scale_factor ?? 1,
        Source: recipe.source_type === 'barrel' ? 'Barrel' : 'Tank',
        Version: recipe.current_version_number ?? '',
        Notes: text(recipe.notes),
      }),
      ingredients,
    });
  }

  const headers = [...RECIPE_EXPORT_BASE_HEADERS, ...columns];
  const rows = built.map((recipe) => [
    ...recipe.fixed,
    ...columns.map((column) => recipe.ingredients.get(column) ?? ''),
  ]);
  return { headers, rows };
}
