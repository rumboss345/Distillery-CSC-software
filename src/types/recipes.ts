export interface RcRecipe {
  id: number;
  recipe_code: string;
  product_id: number;
  name: string;
  description: string;
  recipe_type: string;
  status: string;
  active_version_id: number | null;
  created_at: string;
  updated_at: string;
  product_name?: string;
  active_version_number?: number | null;
}

export type RcRecipeSaveInput = Omit<
  RcRecipe,
  'id' | 'recipe_code' | 'active_version_id' | 'created_at' | 'updated_at' | 'product_name' | 'active_version_number'
>;

export interface RcRecipeVersion {
  id: number;
  recipe_id: number;
  version_number: number;
  version_label: string;
  status: string;
  effective_date: string | null;
  target_batch_size: number;
  batch_size_unit: string;
  target_abv: number | null;
  expected_yield_percent: number | null;
  expected_final_volume_litres: number | null;
  instructions: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type RcRecipeVersionSaveInput = Omit<
  RcRecipeVersion,
  'id' | 'recipe_id' | 'version_number' | 'created_at' | 'updated_at'
>;

export interface RcRecipeIngredient {
  id: number;
  recipe_version_id: number;
  ingredient_type: string;
  raw_material_id: number | null;
  bulk_spirit_id: number | null;
  description: string;
  quantity: number;
  unit: string;
  quantity_basis: string;
  sequence: number;
  optional: number;
  notes: string;
  material_name?: string | null;
  bulk_spirit_abv?: number | null;
}

export type RcRecipeIngredientSaveInput = Omit<
  RcRecipeIngredient,
  'id' | 'recipe_version_id' | 'material_name' | 'bulk_spirit_abv'
>;

export interface RcRecipePackaging {
  id: number;
  recipe_version_id: number;
  sku_id: number | null;
  packaging_material_id: number | null;
  quantity: number;
  quantity_basis: string;
  waste_allowance_percent: number | null;
  notes: string;
  sku_name?: string | null;
  packaging_name?: string | null;
}

export type RcRecipePackagingSaveInput = Omit<
  RcRecipePackaging,
  'id' | 'recipe_version_id' | 'sku_name' | 'packaging_name'
>;
