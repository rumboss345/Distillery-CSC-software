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
  target_brix: number | null;
  target_ph: number | null;
  target_carbonation_volumes: number | null;
  instructions: string;
  notes: string;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RcRecipeVersionSaveInput = Omit<
  RcRecipeVersion,
  'id' | 'recipe_id' | 'version_number' | 'created_at' | 'updated_at' | 'created_by' | 'approved_by' | 'approved_at'
>;

export interface RcRecipeIngredient {
  id: number;
  recipe_version_id: number;
  ingredient_type: string;
  raw_material_id: number | null;
  bulk_spirit_id: number | null;
  source_lot_id: number | null;
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

export interface RcRecipeStep {
  id: number;
  recipe_version_id: number;
  step_number: number;
  instruction: string;
  notes: string;
}

export type RcRecipeStepSaveInput = Omit<RcRecipeStep, 'id' | 'recipe_version_id'>;

/** Repository contract for future server implementation (Step 1A+). */
export interface RecipesRepository {
  listRecipes(statusFilter?: string): RcRecipe[];
  getRecipe(id: number): RcRecipe | null;
  saveRecipe(data: RcRecipeSaveInput, id?: number): number;
  setRecipeActive(id: number, status: string): void;
  listVersions(recipeId: number): RcRecipeVersion[];
  getVersion(id: number): RcRecipeVersion | null;
  createVersion(recipeId: number, data: RcRecipeVersionSaveInput): number;
  cloneVersion(sourceVersionId: number): number;
  saveVersion(versionId: number, data: RcRecipeVersionSaveInput): number;
  activateVersion(recipeId: number, versionId: number, approvedBy?: string | null): void;
  archiveVersion(recipeId: number, versionId: number): void;
  listIngredients(versionId: number): RcRecipeIngredient[];
  saveIngredient(versionId: number, data: RcRecipeIngredientSaveInput, id?: number): number;
  removeDraftIngredient(versionId: number, ingredientId: number): void;
  listPackaging(versionId: number): RcRecipePackaging[];
  savePackagingItem(versionId: number, data: RcRecipePackagingSaveInput, id?: number): number;
  removeDraftPackaging(versionId: number, packagingId: number): void;
  listSteps(versionId: number): RcRecipeStep[];
  saveStep(versionId: number, data: RcRecipeStepSaveInput, id?: number): number;
  reorderSteps(versionId: number, orderedStepIds: number[]): void;
  removeDraftStep(versionId: number, stepId: number): void;
  insertDilutionWater(versionId: number, waterLitres: number, notes?: string): number;
  lookups: {
    recipeTypes(): string[];
    addRecipeType(name: string): unknown;
  };
}
