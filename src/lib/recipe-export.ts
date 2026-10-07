import { formatBlendRecipeAdditive, formatBlendRecipeSpiritPull } from './blending';
import { formatGinBotanicalsSummary } from './gin-botanicals';
import { formatRecipeNutrientsSummary } from './wash-recipe-nutrients';
import type { BlendRecipeView, GinRecipe, RecipeView } from '../types';

export const RECIPE_EXPORT_HEADERS = [
  'Kind',
  'Name',
  'Product',
  'Spirit type',
  'Sugar',
  'Sugar lbs',
  'Batch size gal',
  'Yeast',
  'Yeast lbs',
  'Target start brix',
  'Target final brix',
  'Nutrients',
  'Botanicals',
  'Target ABV %',
  'Target brix',
  'Target sugar g/L',
  'Target volume gal',
  'Scale',
  'Source',
  'Version',
  'Spirit pulls',
  'Additives',
  'Notes',
] as const;

export interface RecipeExportInput {
  wash?: RecipeView[];
  gin?: GinRecipe[];
  blend?: BlendRecipeView[];
}

function amount(value: number | null | undefined): number | '' {
  if (value == null || value === 0) return '';
  return value;
}

function optionalNumber(value: number | null | undefined): number | '' {
  if (value == null) return '';
  return value;
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function emptyRecipeRow(): (string | number)[] {
  return RECIPE_EXPORT_HEADERS.map(() => '');
}

function row(values: Partial<Record<(typeof RECIPE_EXPORT_HEADERS)[number], string | number>>): (string | number)[] {
  const blank = emptyRecipeRow();
  RECIPE_EXPORT_HEADERS.forEach((header, index) => {
    const value = values[header];
    if (value != null && value !== '') blank[index] = value;
  });
  return blank;
}

export function buildRecipeExportRows(input: RecipeExportInput): (string | number)[][] {
  const wash = (input.wash ?? []).map((recipe) => row({
    Kind: 'Wash',
    Name: recipe.name,
    'Spirit type': text(recipe.spirit_type),
    Sugar: text(recipe.grain_type),
    'Sugar lbs': amount(recipe.grain_lbs),
    'Batch size gal': amount(recipe.water_gal),
    Yeast: text(recipe.yeast_strain),
    'Yeast lbs': amount(recipe.yeast_lbs),
    'Target start brix': optionalNumber(recipe.target_brix),
    'Target final brix': optionalNumber(recipe.target_final_brix),
    Nutrients: formatRecipeNutrientsSummary(recipe.nutrients),
    Notes: text(recipe.notes),
  }));

  const gin = (input.gin ?? []).map((recipe) => row({
    Kind: 'Gin',
    Name: recipe.name,
    Botanicals: formatGinBotanicalsSummary(recipe.botanicals),
    Notes: text(recipe.notes),
  }));

  const blend = (input.blend ?? []).map((recipe) => row({
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
    'Spirit pulls': recipe.spirit_sources
      .map((source) => formatBlendRecipeSpiritPull(
        source.spirit_label,
        source.volume_gal,
        source.abv,
        { amount: source.entered_amount, unit: source.entered_unit },
      ))
      .join(' | '),
    Additives: recipe.ingredients
      .map((ingredient) => formatBlendRecipeAdditive(ingredient))
      .join(' | '),
    Notes: text(recipe.notes),
  }));

  return [...wash, ...gin, ...blend];
}
