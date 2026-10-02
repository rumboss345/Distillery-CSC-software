import type { BlendIngredientInput, BlendRecipeSpiritSourceInput } from '../types';

/** Frozen copy of a master blend recipe. Historical batches keep the version they started from. */
export interface BlendRecipeVersionSnapshot {
  product_name: string;
  target_abv: number | null;
  target_brix: number | null;
  target_sugar_g_per_l: number | null;
  target_volume_gal: number | null;
  scale_factor: number;
  source_type: string;
  notes: string;
  spirit_sources: BlendRecipeSpiritSourceInput[];
  ingredients: BlendIngredientInput[];
}

function round4(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}

function round4req(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

export function buildBlendRecipeSnapshot(input: {
  product_name: string;
  target_abv: number | null;
  target_brix: number | null;
  target_sugar_g_per_l?: number | null;
  target_volume_gal?: number | null;
  scale_factor: number;
  source_type: string;
  notes: string;
  spirit_sources: BlendRecipeSpiritSourceInput[];
  ingredients: BlendIngredientInput[];
}): BlendRecipeVersionSnapshot {
  const spirit_sources = input.spirit_sources
    .filter((source) => source.volume_gal > 0)
    .map((source) => ({
      spirit_label: source.spirit_label.trim(),
      volume_gal: round4req(source.volume_gal),
      abv: round4req(source.abv),
      barrel_id: source.barrel_id ?? null,
    }))
    .sort((a, b) =>
      a.spirit_label.localeCompare(b.spirit_label)
      || a.abv - b.abv
      || a.volume_gal - b.volume_gal,
    );

  const ingredients = input.ingredients
    .filter((ingredient) => ingredient.amount > 0 || ingredient.name.trim())
    .map((ingredient) => ({
      ingredient_type: ingredient.ingredient_type,
      name: ingredient.name.trim(),
      amount: round4req(ingredient.amount),
      unit: ingredient.unit.trim(),
      abv: round4(ingredient.abv),
      cost_per_unit: round4(ingredient.cost_per_unit),
      lot_number: (ingredient.lot_number ?? '').trim(),
      inventory_item_id: ingredient.inventory_item_id ?? null,
      notes: (ingredient.notes ?? '').trim(),
    }))
    .sort((a, b) =>
      a.ingredient_type.localeCompare(b.ingredient_type)
      || a.name.localeCompare(b.name)
      || a.amount - b.amount,
    );

  return {
    product_name: input.product_name.trim(),
    target_abv: round4(input.target_abv),
    target_brix: round4(input.target_brix),
    target_sugar_g_per_l: round4(input.target_sugar_g_per_l),
    target_volume_gal: round4(input.target_volume_gal),
    scale_factor: round4req(input.scale_factor || 1),
    source_type: input.source_type || 'tank',
    notes: input.notes.trim(),
    spirit_sources,
    ingredients,
  };
}

export function blendRecipeSnapshotKey(snapshot: BlendRecipeVersionSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseBlendRecipeSnapshot(json: string): BlendRecipeVersionSnapshot | null {
  try {
    const parsed = JSON.parse(json) as BlendRecipeVersionSnapshot;
    if (!parsed || !Array.isArray(parsed.spirit_sources) || !Array.isArray(parsed.ingredients)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
