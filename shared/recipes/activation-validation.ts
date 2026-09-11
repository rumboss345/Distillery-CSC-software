import {
  validateBatchSizeUnit,
  validateCarbonationOptional,
  validateExpectedYieldOptional,
  validateIngredientQuantity,
  validateIngredientUnit,
  validateTargetAbvOptional,
  validateTargetBatchSize,
  validateTargetBrixOptional,
  validateTargetPhOptional,
} from './validation.js';

export interface ActivationIngredientRow {
  ingredient_type: string;
  raw_material_id: number | null;
  bulk_spirit_id: number | null;
  description: string;
  quantity: number;
  unit: string;
}

export interface ActivationPackagingRow {
  sku_id: number | null;
  packaging_material_id: number | null;
  quantity: number;
}

export interface ActivationValidationContext {
  productId: number;
  productExists: boolean;
  version: {
    target_batch_size: number;
    batch_size_unit: string;
    target_abv: number | null;
    expected_yield_percent: number | null;
    target_brix: number | null;
    target_ph: number | null;
    target_carbonation_volumes: number | null;
  };
  ingredients: ActivationIngredientRow[];
  packaging: ActivationPackagingRow[];
  validRawMaterialIds: ReadonlySet<number>;
  validBulkSpiritIds: ReadonlySet<number>;
  validPackagingMaterialIds: ReadonlySet<number>;
  skuProductIdBySkuId: ReadonlyMap<number, number>;
}

/** Collect activation validation errors (empty = ready to activate). */
export function collectActivationErrors(ctx: ActivationValidationContext): string[] {
  const errors: string[] = [];

  if (!ctx.productId || !ctx.productExists) {
    errors.push('Recipe must be linked to a valid product.');
  }

  try {
    validateTargetBatchSize(ctx.version.target_batch_size);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Invalid batch size.');
  }

  try {
    validateBatchSizeUnit(ctx.version.batch_size_unit);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Invalid batch unit.');
  }

  try {
    validateTargetAbvOptional(ctx.version.target_abv);
    validateExpectedYieldOptional(ctx.version.expected_yield_percent);
    validateTargetBrixOptional(ctx.version.target_brix);
    validateTargetPhOptional(ctx.version.target_ph);
    validateCarbonationOptional(ctx.version.target_carbonation_volumes);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Invalid version specification.');
  }

  for (const [i, ing] of ctx.ingredients.entries()) {
    const label = `Ingredient ${i + 1}`;
    try {
      validateIngredientQuantity(ing.quantity);
      validateIngredientUnit(ing.unit);
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : 'invalid quantity/unit'}`);
      continue;
    }
    if (ing.ingredient_type === 'Raw Material') {
      if (!ing.raw_material_id) errors.push(`${label}: raw material reference is required.`);
      else if (!ctx.validRawMaterialIds.has(ing.raw_material_id)) {
        errors.push(`${label}: raw material reference is invalid or inactive.`);
      }
    } else if (ing.ingredient_type === 'Bulk Spirit') {
      if (!ing.bulk_spirit_id) errors.push(`${label}: bulk spirit reference is required.`);
      else if (!ctx.validBulkSpiritIds.has(ing.bulk_spirit_id)) {
        errors.push(`${label}: bulk spirit reference is invalid or inactive.`);
      }
    } else if (ing.ingredient_type === 'Other' && !ing.description.trim()) {
      errors.push(`${label}: description is required for Other ingredients.`);
    }
  }

  for (const [i, pkg] of ctx.packaging.entries()) {
    const label = `Packaging line ${i + 1}`;
    try {
      validateIngredientQuantity(pkg.quantity);
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : 'invalid quantity'}`);
      continue;
    }
    if (!pkg.packaging_material_id) {
      errors.push(`${label}: packaging material is required.`);
    } else if (!ctx.validPackagingMaterialIds.has(pkg.packaging_material_id)) {
      errors.push(`${label}: packaging material reference is invalid or inactive.`);
    }
    if (pkg.sku_id != null) {
      const skuProduct = ctx.skuProductIdBySkuId.get(pkg.sku_id);
      if (skuProduct == null) {
        errors.push(`${label}: SKU reference is invalid.`);
      } else if (skuProduct !== ctx.productId) {
        errors.push(`${label}: SKU must belong to the same product as this recipe.`);
      }
    }
  }

  return errors;
}

export function assertActivationReady(ctx: ActivationValidationContext): void {
  const errors = collectActivationErrors(ctx);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }
}
