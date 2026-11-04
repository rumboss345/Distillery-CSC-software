import { blendIngredientTypeForCategory } from './blending';
import type { FormulationKind } from './formulation-engine';
import type { BlendIngredientType } from '../types';

const PREFERRED_OTHER_CATEGORIES = ['flavoring', 'syrup', 'color'] as const;

/** Default inventory category for a new “other ingredient” row in blend designer. */
export function defaultBlendDesignerOtherCategory(categories: string[]): string {
  const lower = new Set(categories.map((name) => name.trim().toLowerCase()));
  for (const preferred of PREFERRED_OTHER_CATEGORIES) {
    if (lower.has(preferred)) {
      return categories.find((name) => name.trim().toLowerCase() === preferred) ?? preferred;
    }
  }
  for (const name of categories) {
    const type = blendIngredientTypeForCategory(name);
    if (type !== 'water' && type !== 'sugar') return name;
  }
  return '';
}

export interface BlendDesignerOtherRow {
  inventory_category: string;
  name: string;
  abv: string;
  sucrosePercent: string;
  density_g_per_ml: number | null;
  density_assumption: 'water' | 'cs1-syrup' | 'class-i-caramel' | null;
}

export function otherRowFormulationKind(row: BlendDesignerOtherRow): FormulationKind {
  const category = row.inventory_category.trim();
  if (!category) return 'other';
  const type = blendIngredientTypeForCategory(category);
  if (type === 'water') return 'water';
  if (type === 'sugar') return 'sugar';
  return type;
}

export function otherRowIngredientType(row: BlendDesignerOtherRow): BlendIngredientType {
  const category = row.inventory_category.trim();
  if (!category) return 'other';
  return blendIngredientTypeForCategory(category);
}

/** Map formulation component kind to blend recipe ingredient type for display math. */
export function formulationKindToBlendIngredientType(kind: FormulationKind): BlendIngredientType {
  if (kind === 'spirit') return 'other';
  if (kind === 'water' || kind === 'sugar' || kind === 'syrup' || kind === 'flavoring' || kind === 'color') {
    return kind;
  }
  return 'other';
}

export function blendDesignerOtherCategories(categories: string[]): string[] {
  return categories.filter((name) => {
    const type = blendIngredientTypeForCategory(name);
    return type !== 'water' && type !== 'sugar';
  });
}
