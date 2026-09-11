import { formatBusinessCode } from '../../shared/master-data/codes';
import { nextBusinessCode } from './master-data-queries';
import {
  DEFAULT_RECIPE_TYPES,
  RECIPE_LOOKUP_TYPES,
} from '../../shared/recipes/constants';
import {
  validateIngredientQuantity,
  validateIngredientType,
  validateQuantityBasis,
  validateRecipeName,
  validateTargetAbvOptional,
  validateTargetBatchSize,
  validateVersionStatus,
} from '../../shared/recipes/validation';
import type {
  RcRecipe,
  RcRecipeIngredient,
  RcRecipeIngredientSaveInput,
  RcRecipePackaging,
  RcRecipePackagingSaveInput,
  RcRecipeSaveInput,
  RcRecipeVersion,
  RcRecipeVersionSaveInput,
} from '../types/recipes';
import { insertRow, queryAll, queryOne, runQuery } from './database';
import { getLookupNames, addLookupValue } from './master-data-queries';

const now = () => new Date().toISOString();

function assertVersionEditable(versionId: number): RcRecipeVersion {
  const version = queryOne<RcRecipeVersion>('SELECT * FROM rc_recipe_versions WHERE id = ?', [versionId]);
  if (!version) throw new Error('Recipe version not found.');
  if (version.status !== 'Draft') {
    throw new Error('Only Draft versions can be edited. Create a new version to change an Active or Archived formula.');
  }
  return version;
}

function assertUniqueCode(table: string, codeColumn: string, code: string, excludeId?: number) {
  const existing = queryOne<{ id: number }>(
    `SELECT id FROM ${table} WHERE ${codeColumn} = ? COLLATE NOCASE${excludeId != null ? ' AND id != ?' : ''}`,
    excludeId != null ? [code, excludeId] : [code],
  );
  if (existing) throw new Error(`Code "${code}" already exists.`);
}

// ─── Lookups ───────────────────────────────────────────────────────────────

export function seedRecipeLookupsIfEmpty(): void {
  for (const [i, name] of DEFAULT_RECIPE_TYPES.entries()) {
    runQuery(
      'INSERT OR IGNORE INTO md_lookup_values (lookup_type, name, sort_order) VALUES (?, ?, ?)',
      [RECIPE_LOOKUP_TYPES.RECIPE_TYPE, name, i + 1],
    );
  }
}

export function getRecipeTypes(): string[] {
  return getLookupNames(RECIPE_LOOKUP_TYPES.RECIPE_TYPE);
}

export function addRecipeType(name: string) {
  return addLookupValue(RECIPE_LOOKUP_TYPES.RECIPE_TYPE, name);
}

// ─── Recipes ───────────────────────────────────────────────────────────────

export function getRecipes(statusFilter?: string): RcRecipe[] {
  let sql = `
    SELECT r.*, p.name AS product_name, v.version_number AS active_version_number
    FROM rc_recipes r
    JOIN md_products p ON p.id = r.product_id
    LEFT JOIN rc_recipe_versions v ON v.id = r.active_version_id
  `;
  const params: unknown[] = [];
  if (statusFilter && statusFilter !== 'all') {
    sql += ' WHERE r.status = ?';
    params.push(statusFilter);
  }
  sql += ' ORDER BY r.name COLLATE NOCASE';
  return queryAll<RcRecipe>(sql, params as never[]);
}

export function getRecipe(id: number): RcRecipe | null {
  return queryOne<RcRecipe>(
    `SELECT r.*, p.name AS product_name, v.version_number AS active_version_number
     FROM rc_recipes r
     JOIN md_products p ON p.id = r.product_id
     LEFT JOIN rc_recipe_versions v ON v.id = r.active_version_id
     WHERE r.id = ?`,
    [id],
  );
}

export function saveRecipe(data: RcRecipeSaveInput, id?: number, code?: string): number {
  validateRecipeName(data.name);
  if (!data.product_id) throw new Error('Product is required.');
  const ts = now();
  if (id) {
    if (code) assertUniqueCode('rc_recipes', 'recipe_code', code, id);
    runQuery(
      `UPDATE rc_recipes SET product_id=?, name=?, description=?, recipe_type=?, status=?, updated_at=?,
       recipe_code=COALESCE(?, recipe_code) WHERE id=?`,
      [data.product_id, data.name, data.description, data.recipe_type, data.status, ts, code ?? null, id],
    );
    return id;
  }
  const recipeCode = code ?? nextBusinessCode('recipe', 'rc_recipes', 'recipe_code');
  assertUniqueCode('rc_recipes', 'recipe_code', recipeCode);
  const recipeId = insertRow(
    `INSERT INTO rc_recipes (recipe_code, product_id, name, description, recipe_type, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [recipeCode, data.product_id, data.name, data.description, data.recipe_type, data.status, ts, ts],
  );
  createRecipeVersion(recipeId, {
    version_label: 'Initial',
    status: 'Draft',
    effective_date: null,
    target_batch_size: 1000,
    batch_size_unit: 'L',
    target_abv: null,
    expected_yield_percent: null,
    expected_final_volume_litres: null,
    instructions: '',
    notes: '',
  });
  return recipeId;
}

export function setRecipeStatus(id: number, status: string) {
  runQuery('UPDATE rc_recipes SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
}

// ─── Versions ──────────────────────────────────────────────────────────────

export function getRecipeVersions(recipeId: number): RcRecipeVersion[] {
  return queryAll<RcRecipeVersion>(
    'SELECT * FROM rc_recipe_versions WHERE recipe_id = ? ORDER BY version_number DESC',
    [recipeId],
  );
}

export function getRecipeVersion(id: number): RcRecipeVersion | null {
  return queryOne<RcRecipeVersion>('SELECT * FROM rc_recipe_versions WHERE id = ?', [id]);
}

export function getNextVersionNumber(recipeId: number): number {
  const row = queryOne<{ max_num: number | null }>(
    'SELECT MAX(version_number) AS max_num FROM rc_recipe_versions WHERE recipe_id = ?',
    [recipeId],
  );
  return (row?.max_num ?? 0) + 1;
}

export function createRecipeVersion(recipeId: number, data: RcRecipeVersionSaveInput): number {
  validateVersionStatus(data.status);
  validateTargetBatchSize(data.target_batch_size);
  validateTargetAbvOptional(data.target_abv);
  const versionNumber = getNextVersionNumber(recipeId);
  const ts = now();
  return insertRow(
    `INSERT INTO rc_recipe_versions (recipe_id, version_number, version_label, status, effective_date,
      target_batch_size, batch_size_unit, target_abv, expected_yield_percent, expected_final_volume_litres,
      instructions, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [recipeId, versionNumber, data.version_label, data.status, data.effective_date,
      data.target_batch_size, data.batch_size_unit, data.target_abv, data.expected_yield_percent,
      data.expected_final_volume_litres, data.instructions, data.notes, ts, ts],
  );
}

export function saveRecipeVersion(versionId: number, data: RcRecipeVersionSaveInput): number {
  assertVersionEditable(versionId);
  validateVersionStatus(data.status);
  validateTargetBatchSize(data.target_batch_size);
  validateTargetAbvOptional(data.target_abv);
  runQuery(
    `UPDATE rc_recipe_versions SET version_label=?, status=?, effective_date=?, target_batch_size=?,
     batch_size_unit=?, target_abv=?, expected_yield_percent=?, expected_final_volume_litres=?,
     instructions=?, notes=?, updated_at=? WHERE id=?`,
    [data.version_label, data.status, data.effective_date, data.target_batch_size, data.batch_size_unit,
      data.target_abv, data.expected_yield_percent, data.expected_final_volume_litres,
      data.instructions, data.notes, now(), versionId],
  );
  return versionId;
}

export function cloneRecipeVersion(sourceVersionId: number): number {
  const source = queryOne<RcRecipeVersion>('SELECT * FROM rc_recipe_versions WHERE id = ?', [sourceVersionId]);
  if (!source) throw new Error('Source version not found.');
  const newVersionId = createRecipeVersion(source.recipe_id, {
    version_label: source.version_label ? `${source.version_label} (copy)` : '',
    status: 'Draft',
    effective_date: null,
    target_batch_size: source.target_batch_size,
    batch_size_unit: source.batch_size_unit,
    target_abv: source.target_abv,
    expected_yield_percent: source.expected_yield_percent,
    expected_final_volume_litres: source.expected_final_volume_litres,
    instructions: source.instructions,
    notes: source.notes,
  });
  for (const ing of getRecipeIngredients(sourceVersionId)) {
    saveRecipeIngredient(newVersionId, {
      ingredient_type: ing.ingredient_type,
      raw_material_id: ing.raw_material_id,
      bulk_spirit_id: ing.bulk_spirit_id,
      description: ing.description,
      quantity: ing.quantity,
      unit: ing.unit,
      quantity_basis: ing.quantity_basis,
      sequence: ing.sequence,
      optional: ing.optional,
      notes: ing.notes,
    });
  }
  for (const pkg of getRecipePackaging(sourceVersionId)) {
    saveRecipePackaging(newVersionId, {
      sku_id: pkg.sku_id,
      packaging_material_id: pkg.packaging_material_id,
      quantity: pkg.quantity,
      quantity_basis: pkg.quantity_basis,
      waste_allowance_percent: pkg.waste_allowance_percent,
      notes: pkg.notes,
    });
  }
  return newVersionId;
}

export function activateRecipeVersion(recipeId: number, versionId: number): void {
  const version = queryOne<RcRecipeVersion>(
    'SELECT * FROM rc_recipe_versions WHERE id = ? AND recipe_id = ?',
    [versionId, recipeId],
  );
  if (!version) throw new Error('Recipe version not found.');
  if (version.status === 'Archived') {
    throw new Error('Archived versions cannot be activated. Clone to a new Draft version first.');
  }
  const ts = now();
  runQuery(
    `UPDATE rc_recipe_versions SET status = 'Archived', updated_at = ? WHERE recipe_id = ? AND status = 'Active'`,
    [ts, recipeId],
  );
  runQuery(
    `UPDATE rc_recipe_versions SET status = 'Active', updated_at = ? WHERE id = ?`,
    [ts, versionId],
  );
  runQuery(
    'UPDATE rc_recipes SET active_version_id = ?, status = ?, updated_at = ? WHERE id = ?',
    [versionId, 'Active', ts, recipeId],
  );
}

export function archiveRecipeVersion(recipeId: number, versionId: number): void {
  const version = queryOne<RcRecipeVersion>(
    'SELECT * FROM rc_recipe_versions WHERE id = ? AND recipe_id = ?',
    [versionId, recipeId],
  );
  if (!version) throw new Error('Recipe version not found.');
  const ts = now();
  runQuery(`UPDATE rc_recipe_versions SET status = 'Archived', updated_at = ? WHERE id = ?`, [ts, versionId]);
  const recipe = queryOne<RcRecipe>('SELECT active_version_id FROM rc_recipes WHERE id = ?', [recipeId]);
  if (recipe?.active_version_id === versionId) {
    runQuery('UPDATE rc_recipes SET active_version_id = NULL, updated_at = ? WHERE id = ?', [ts, recipeId]);
  }
}

// ─── Ingredients ───────────────────────────────────────────────────────────

export function getRecipeIngredients(versionId: number): RcRecipeIngredient[] {
  return queryAll<RcRecipeIngredient>(
    `SELECT i.*,
       COALESCE(rm.name, bs.name, i.description) AS material_name,
       bs.nominal_abv AS bulk_spirit_abv
     FROM rc_recipe_ingredients i
     LEFT JOIN md_raw_materials rm ON rm.id = i.raw_material_id
     LEFT JOIN md_bulk_spirits bs ON bs.id = i.bulk_spirit_id
     WHERE i.recipe_version_id = ?
     ORDER BY i.sequence, i.id`,
    [versionId],
  );
}

function validateIngredientRefs(data: RcRecipeIngredientSaveInput): void {
  validateIngredientType(data.ingredient_type);
  validateQuantityBasis(data.quantity_basis);
  validateIngredientQuantity(data.quantity);
  if (data.ingredient_type === 'Raw Material' && !data.raw_material_id) {
    throw new Error('Raw material is required for this ingredient type.');
  }
  if (data.ingredient_type === 'Bulk Spirit' && !data.bulk_spirit_id) {
    throw new Error('Bulk spirit is required for this ingredient type.');
  }
  if (data.ingredient_type === 'Water' && !data.description.trim()) {
    // default description ok
  }
  if (data.ingredient_type === 'Other' && !data.description.trim()) {
    throw new Error('Description is required for Other ingredients.');
  }
}

export function saveRecipeIngredient(
  versionId: number,
  data: RcRecipeIngredientSaveInput,
  id?: number,
): number {
  assertVersionEditable(versionId);
  validateIngredientRefs(data);
  if (id) {
    runQuery(
      `UPDATE rc_recipe_ingredients SET ingredient_type=?, raw_material_id=?, bulk_spirit_id=?, description=?,
       quantity=?, unit=?, quantity_basis=?, sequence=?, optional=?, notes=? WHERE id = ? AND recipe_version_id = ?`,
      [data.ingredient_type, data.raw_material_id, data.bulk_spirit_id, data.description,
        data.quantity, data.unit, data.quantity_basis, data.sequence, data.optional, data.notes, id, versionId],
    );
    return id;
  }
  return insertRow(
    `INSERT INTO rc_recipe_ingredients (recipe_version_id, ingredient_type, raw_material_id, bulk_spirit_id,
      description, quantity, unit, quantity_basis, sequence, optional, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [versionId, data.ingredient_type, data.raw_material_id, data.bulk_spirit_id, data.description,
      data.quantity, data.unit, data.quantity_basis, data.sequence, data.optional, data.notes],
  );
}

export function deleteRecipeIngredient(versionId: number, ingredientId: number): void {
  assertVersionEditable(versionId);
  runQuery('DELETE FROM rc_recipe_ingredients WHERE id = ? AND recipe_version_id = ?', [ingredientId, versionId]);
}

// ─── Packaging ─────────────────────────────────────────────────────────────

export function getRecipePackaging(versionId: number): RcRecipePackaging[] {
  return queryAll<RcRecipePackaging>(
    `SELECT p.*, s.name AS sku_name, pm.name AS packaging_name
     FROM rc_recipe_packaging p
     LEFT JOIN md_skus s ON s.id = p.sku_id
     LEFT JOIN md_packaging_materials pm ON pm.id = p.packaging_material_id
     WHERE p.recipe_version_id = ?
     ORDER BY p.id`,
    [versionId],
  );
}

export function saveRecipePackaging(
  versionId: number,
  data: RcRecipePackagingSaveInput,
  id?: number,
): number {
  assertVersionEditable(versionId);
  validateQuantityBasis(data.quantity_basis);
  validateIngredientQuantity(data.quantity);
  if (!data.sku_id && !data.packaging_material_id) {
    throw new Error('SKU or packaging material is required.');
  }
  if (id) {
    runQuery(
      `UPDATE rc_recipe_packaging SET sku_id=?, packaging_material_id=?, quantity=?, quantity_basis=?,
       waste_allowance_percent=?, notes=? WHERE id = ? AND recipe_version_id = ?`,
      [data.sku_id, data.packaging_material_id, data.quantity, data.quantity_basis,
        data.waste_allowance_percent, data.notes, id, versionId],
    );
    return id;
  }
  return insertRow(
    `INSERT INTO rc_recipe_packaging (recipe_version_id, sku_id, packaging_material_id, quantity,
      quantity_basis, waste_allowance_percent, notes)
     VALUES (?,?,?,?,?,?,?)`,
    [versionId, data.sku_id, data.packaging_material_id, data.quantity, data.quantity_basis,
      data.waste_allowance_percent, data.notes],
  );
}

export function deleteRecipePackaging(versionId: number, packagingId: number): void {
  assertVersionEditable(versionId);
  runQuery('DELETE FROM rc_recipe_packaging WHERE id = ? AND recipe_version_id = ?', [packagingId, versionId]);
}

/** Insert theoretical water from dilution calculator into a Draft version. */
export function insertDilutionWaterIngredient(
  versionId: number,
  waterLitres: number,
  notes = 'Theoretical dilution water (calculator)',
): number {
  assertVersionEditable(versionId);
  validateIngredientQuantity(waterLitres);
  const maxSeq = queryOne<{ max_seq: number | null }>(
    'SELECT MAX(sequence) AS max_seq FROM rc_recipe_ingredients WHERE recipe_version_id = ?',
    [versionId],
  )?.max_seq ?? 0;
  return saveRecipeIngredient(versionId, {
    ingredient_type: 'Water',
    raw_material_id: null,
    bulk_spirit_id: null,
    description: 'Dilution water (theoretical)',
    quantity: waterLitres,
    unit: 'L',
    quantity_basis: 'Fixed Quantity',
    sequence: maxSeq + 1,
    optional: 0,
    notes,
  });
}

export { formatBusinessCode };
