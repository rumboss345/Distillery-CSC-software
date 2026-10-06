import { useCallback, useEffect, useState } from 'react';
import { BARREL_STOCK_CATEGORY, BARREL_STOCK_ITEM_NAME } from '../lib/barrel-inventory';
import {
  packagingBottleCountsBySku,
  packagingInventoryAdjustments,
} from '../lib/bottling-lines';
import {
  collectionVesselAcceptsIncomingCut,
  collectionVesselContentsLabel,
  collectionVesselCutMixMessage,
  inflowsAreStillageOnly,
  inflowsIncludeNonStillage,
  storedCutTypeFromInflows,
  type StoredCutType,
  type VesselInflow,
} from '../lib/collection-vessel-cuts';
import { isFermenterSourcedRun, isSpiritStyleRun, isTankSourcedRun } from '../lib/distillation-run-types';
import { activeGinBotanicals, normalizeBotanicalWeightUnit } from '../lib/gin-botanicals';
import {
  chargeExceedsStillCapacity,
  plannedRecordSkipsEquipmentStatus,
  fermenterChargeSkipsCleaningGate,
  runConsumesSource,
  stillAlreadyOccupiedMessage,
  stillChargeCapacityMessage,
  stillRunOccupiesEquipment,
} from '../lib/still-charge';
import {
  equipmentBlocksProduction,
  equipmentUnavailableForProduction,
  maintenanceStatusLabel,
} from '../lib/equipment-maintenance';
import { equipmentCleaningStatusLabel, equipmentNeedsCleaning, equipmentStatusWhenReturningToPlanned } from '../lib/equipment-cleaning';
import { assertEnteredAbv } from '../lib/abv-limits';
import { roundThousandths, tankVolumeVarianceGal } from '../lib/tank-volume-variance';
import { EQUIPMENT_TYPES, isSpiritLedgerEquipmentType, resolveEquipmentIcon } from '../lib/equipment';
import { equipmentTypeDeleteError, equipmentTypeNameError, normalizeEquipmentTypeName } from '../lib/equipment-type';
import { countActiveFermentations, fermenterShowsAssignedWash } from '../lib/mash-fermenter-fill';
import { compareStoredDatesDesc } from '../lib/date-input';
import { eventDateWhenLeavingPlanned, localIsoDate } from '../lib/planned-event-date';
import { DISCARD_DESTINATION, fermenterTransferError } from '../lib/fermenter-transfer';
import {
  distillationStillageTankError,
  isStillageTankType,
  persistedStillage,
  stillageSaveError,
  stillageTransferError,
} from '../lib/stillage';
import {
  normalizeWarehouseLocationName,
  warehouseLocationNameError,
} from '../lib/warehouse-locations';
import { normalizeNutrientUnit, nutrientAmountInUnit } from '../lib/wash-recipe-nutrients';
import {
  blendRecipeSnapshotKey,
  buildBlendRecipeSnapshot,
  parseBlendRecipeSnapshot,
} from '../lib/blend-recipe-version';
import { inventoryQuantityDelta } from '../lib/inventory-units';
import { mashStatusFromFermentations } from '../lib/wash-stage';
import type {
  EquipmentMaintenanceLogEventType,
  EquipmentMaintenanceLogView,
  EquipmentMaintenanceStatus,
} from '../types';
import { initDatabase, clearAllData } from './database';
import type {
  Barrel,
  BarrelFill,
  WarehouseLocation,
  BlendFormulaVersion,
  BlendIngredient,
  BlendIngredientInput,
  BlendProduct,
  BlendProductView,
  BlendRecipe,
  BlendRecipeIngredient,
  BlendRecipeSpiritSource,
  BlendRecipeSpiritSourceInput,
  BlendRecipeVersion,
  BlendRecipeView,
  BlendSpiritSource,
  BlendSpiritSourceInput,
  BottlingRun,
  BottlingRunLine,
  BottlingRunLineInput,
  BottlingRunView,
  CutType,
  DistillationCut,
  DistillationCutView,
  HoldingTankContents,
  HoldingTankIntakeEntry,
  DiscardedFermentation,
  HoldingTankTransfer,
  HoldingTankTransferView,
  DistillationRun,
  DistillationRunBotanical,
  DistillationRunType,
  DistillationRunView,
  GinBotanicalInput,
  GinRecipe,
  GinRecipeBotanical,
  FermentationLog,
  FermentationLogView,
  FermentationAssignmentStatus,
  MashFermenterAssignment,
  FloorEquipment,
  FloorEquipmentView,
  FloorPlan,
  InventoryItem,
  MashBatch,
  MashStatus,
  Recipe,
  RecipeNutrient,
  RecipeNutrientInput,
  RecipeView,
  MashBatchNutrient,
  MashBatchNutrientInput,
  ProductionSummary,
  EquipmentVolumeReport,
  YieldReport,
} from '../types';
import { mlToGallons } from '../types';
import {
  insertRow,
  queryAll,
  queryOne,
  runQuery,
} from './database';
import {
  computeTheoreticalBlend,
  proofingRecordForBlend,
  reconcileMeasurements,
  type AdditiveInput,
  type SpiritSourceInput,
} from '../lib/blend-formulation';

/** Statuses that draw spirit from holding tanks (formula saves do not). */
const BLEND_LEDGER_STATUSES_SQL = "('executed', 'bottled', 'blended')";

function onlyProductionUsable<T extends FloorEquipment>(items: T[]): T[] {
  return items.filter((e) => !equipmentUnavailableForProduction(e));
}

function appendEquipmentMaintenanceLog(entry: {
  floor_equipment_id: number;
  event_type: EquipmentMaintenanceLogEventType;
  maintenance_status?: EquipmentMaintenanceStatus | null;
  notes?: string;
  recorded_by_user_id?: number | null;
  recorded_by_user_name?: string;
}): void {
  insertRow(
    `INSERT INTO equipment_maintenance_log (
      floor_equipment_id, event_type, maintenance_status, notes, recorded_by_user_id, recorded_by_user_name
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.floor_equipment_id,
      entry.event_type,
      entry.maintenance_status ?? null,
      entry.notes?.trim() ?? '',
      entry.recorded_by_user_id ?? null,
      entry.recorded_by_user_name?.trim() ?? '',
    ],
  );
}

/** Drop an in-use or cleaning hold created by a record that is planned again. */
function releaseEquipmentWithoutCleaningHold(equipmentId: number, hasContents = false): void {
  const eq = queryOne<{ status: string }>(
    'SELECT status FROM floor_equipment WHERE id = ?',
    [equipmentId],
  );
  if (!eq) return;
  const next = equipmentStatusWhenReturningToPlanned(eq.status, hasContents);
  if (!next || next === eq.status) return;
  if (eq.status === 'cleaning') {
    runQuery(
      `DELETE FROM equipment_maintenance_log
       WHERE id = (
         SELECT id FROM equipment_maintenance_log
         WHERE floor_equipment_id = ? AND event_type = 'needs_cleaning'
         ORDER BY id DESC LIMIT 1
       )`,
      [equipmentId],
    );
  }
  runQuery(
    `UPDATE floor_equipment SET status=?, linked_mash_batch_id=NULL WHERE id=?`,
    [next, equipmentId],
  );
}

function markEquipmentNeedsCleaningAfterUse(equipmentId: number): void {
  const eq = queryOne<FloorEquipment>('SELECT status FROM floor_equipment WHERE id = ?', [equipmentId]);
  if (!eq || eq.status === 'offline') return;
  if (eq.status === 'in_use') {
    runQuery(
      `UPDATE floor_equipment SET status='cleaning', linked_mash_batch_id=NULL WHERE id=?`,
      [equipmentId],
    );
    appendEquipmentMaintenanceLog({
      floor_equipment_id: equipmentId,
      event_type: 'needs_cleaning',
      notes: 'Equipment emptied after production use.',
    });
  }
}

function assertEquipmentUsableForProduction(equipmentId: number, role = 'Equipment'): void {
  const eq = queryOne<FloorEquipment>('SELECT * FROM floor_equipment WHERE id = ?', [equipmentId]);
  if (!eq) throw new Error(`${role} not found.`);
  if (equipmentNeedsCleaning(eq)) {
    throw new Error(
      `${eq.name} is ${equipmentCleaningStatusLabel().toLowerCase()} and cannot be used until marked clean on the process view.`,
    );
  }
  if (equipmentBlocksProduction(eq)) {
    throw new Error(
      `${eq.name} is ${maintenanceStatusLabel(eq.maintenance_status).toLowerCase()} and cannot be used until returned to service.`,
    );
  }
}

export function markEquipmentCleaned(
  equipmentId: number,
  cleanedByUserId: number,
  cleanedByUserName: string,
): void {
  const eq = queryOne<FloorEquipment>('SELECT * FROM floor_equipment WHERE id = ?', [equipmentId]);
  if (!eq) throw new Error('Equipment not found.');
  if (!equipmentNeedsCleaning(eq)) {
    throw new Error(`${eq.name} is not waiting to be cleaned.`);
  }
  if (!cleanedByUserId) {
    throw new Error('Select who cleaned this equipment.');
  }
  runQuery(
    `UPDATE floor_equipment SET status='empty', cleaned_at=datetime('now'), cleaned_by_user_id=?, cleaned_by_user_name=? WHERE id=?`,
    [cleanedByUserId, cleanedByUserName.trim(), equipmentId],
  );
  appendEquipmentMaintenanceLog({
    floor_equipment_id: equipmentId,
    event_type: 'marked_cleaned',
    notes: 'Marked clean and returned to empty status.',
    recorded_by_user_id: cleanedByUserId,
    recorded_by_user_name: cleanedByUserName,
  });
}

function assertStillUsableByName(stillName: string): void {
  const trimmed = stillName.trim();
  if (!trimmed) return;
  const eq = queryOne<FloorEquipment>(
    `SELECT * FROM floor_equipment
     WHERE name = ? AND equipment_type IN ('pot_still', 'column_still')`,
    [trimmed],
  );
  if (eq) assertEquipmentUsableForProduction(eq.id, 'Still');
}

function blendTankDrawsSql(tankParam: string, excludeBlendParam: string): string {
  return `
    SELECT COALESCE(SUM(vol), 0) as volume_gal, COALESCE(SUM(gpa), 0) as gpa FROM (
      SELECT bss.volume_gal as vol, bss.volume_gal * bss.abv / 100 as gpa
      FROM blend_spirit_sources bss
      JOIN blend_products b ON b.id = bss.blend_product_id
      WHERE bss.holding_tank_equipment_id = ${tankParam}
        AND b.status IN ${BLEND_LEDGER_STATUSES_SQL}
        AND (${excludeBlendParam} IS NULL OR b.id != ${excludeBlendParam})
      UNION ALL
      SELECT b.base_spirit_volume_gal, b.base_spirit_volume_gal * b.base_spirit_abv / 100
      FROM blend_products b
      WHERE b.source_holding_tank_equipment_id = ${tankParam}
        AND b.status IN ${BLEND_LEDGER_STATUSES_SQL}
        AND (${excludeBlendParam} IS NULL OR b.id != ${excludeBlendParam})
        AND NOT EXISTS (SELECT 1 FROM blend_spirit_sources bss WHERE bss.blend_product_id = b.id)
    )
  `;
}

function toSpiritInputs(sources: BlendSpiritSourceInput[]): SpiritSourceInput[] {
  return sources
    .filter((s) => s.volume_gal > 0)
    .map((s) => ({ volumeGal: s.volume_gal, abv: s.abv }));
}

function toAdditiveInputs(ingredients: BlendIngredientInput[]): AdditiveInput[] {
  return ingredients
    .filter((i) => i.amount > 0 || i.name.trim())
    .map((i) => ({
      ingredientType: i.ingredient_type,
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      abv: i.abv,
      costPerUnit: i.cost_per_unit ?? undefined,
      lotNumber: i.lot_number,
      inventoryItemId: i.inventory_item_id ?? undefined,
    }));
}

export function computeBlendFormulation(
  spiritSources: BlendSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  actual?: {
    volume_gal?: number | null;
    abv?: number | null;
    density?: number | null;
    brix?: number | null;
  },
  targetAbv?: number | null,
) {
  const theoretical = computeTheoreticalBlend(
    toSpiritInputs(spiritSources),
    toAdditiveInputs(ingredients),
    targetAbv,
  );
  const reconciliation = reconcileMeasurements(
    {
      volumeGal: theoretical.volumeGal,
      abv: theoretical.abv,
      density: theoretical.density,
      brix: theoretical.brix,
    },
    {
      volumeGal: actual?.volume_gal ?? null,
      abv: actual?.abv ?? null,
      density: actual?.density ?? null,
      brix: actual?.brix ?? null,
    },
  );
  return { theoretical, reconciliation };
}

export function useDatabaseReady() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load database'));
  }, []);

  return { ready, error };
}

export function useRefreshKey() {
  const [key, setKey] = useState(0);
  const refresh = useCallback(() => setKey((k) => k + 1), []);
  return { key, refresh };
}

export async function resetAllData(): Promise<void> {
  await clearAllData();
  window.location.reload();
}

// ── Inventory ──────────────────────────────────────────────

export function getInventoryItems(): InventoryItem[] {
  return queryAll<InventoryItem>(
    'SELECT * FROM inventory_items ORDER BY category, name',
  );
}

export function getInventoryByCategory(category: InventoryItem['category']): InventoryItem[] {
  return queryAll<InventoryItem>(
    'SELECT * FROM inventory_items WHERE category = ? ORDER BY name',
    [category],
  );
}

function findInventoryItem(category: InventoryItem['category'], name: string): InventoryItem | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return queryOne<InventoryItem>(
    'SELECT * FROM inventory_items WHERE category = ? AND name = ? COLLATE NOCASE',
    [category, trimmed],
  ) ?? undefined;
}

function applyInventoryDelta(category: InventoryItem['category'], name: string, delta: number): void {
  if (!name.trim() || delta === 0) return;
  const item = findInventoryItem(category, name);
  if (!item) return;
  adjustInventory(item.id, delta);
}

function deductOneBarrelFromInventory(): void {
  const item = findInventoryItem(BARREL_STOCK_CATEGORY, BARREL_STOCK_ITEM_NAME);
  if (!item) {
    throw new Error(
      `Inventory item "${BARREL_STOCK_ITEM_NAME}" was not found. Add it under the barrels category on Inventory.`,
    );
  }
  adjustInventory(item.id, -1);
}

function syncBottlingPackagingInventory(
  previousLines: BottlingRunLineInput[],
  nextLines: BottlingRunLineInput[],
): void {
  const prev = packagingBottleCountsBySku(previousLines);
  const next = packagingBottleCountsBySku(nextLines);
  const adjustments = packagingInventoryAdjustments(prev, next);
  for (const [sku, delta] of Object.entries(adjustments)) {
    applyInventoryDelta('packaging', sku, delta);
  }
}

function bottlingLinesToInventoryInput(lines: BottlingRunLine[]): BottlingRunLineInput[] {
  return lines.map((line) => ({
    packaging_bottle: line.packaging_bottle,
    bottle_size_ml: line.bottle_size_ml,
    bottle_count: line.bottle_count,
  }));
}

export function saveInventoryItem(item: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>, id?: number): void {
  const packageSizeMl = item.category === 'packaging' && item.package_size_ml != null && item.package_size_ml > 0
    ? item.package_size_ml
    : null;
  if (id) {
    runQuery(
      `UPDATE inventory_items SET name=?, category=?, unit=?, quantity=?, reorder_level=?, notes=?, package_size_ml=?, updated_at=datetime('now') WHERE id=?`,
      [item.name, item.category, item.unit, item.quantity, item.reorder_level, item.notes, packageSizeMl, id],
    );
  } else {
    insertRow(
      `INSERT INTO inventory_items (name, category, unit, quantity, reorder_level, notes, package_size_ml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.name, item.category, item.unit, item.quantity, item.reorder_level, item.notes, packageSizeMl],
    );
  }
}

export function adjustInventory(id: number, delta: number): void {
  runQuery(
    `UPDATE inventory_items SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`,
    [delta, id],
  );
}

export function deleteInventoryItem(id: number): void {
  runQuery('DELETE FROM inventory_items WHERE id = ?', [id]);
}

export function getInventoryCategories(): string[] {
  const fromTable = queryAll<{ name: string }>(
    'SELECT name FROM inventory_categories ORDER BY name COLLATE NOCASE',
  ).map((row) => row.name);

  if (fromTable.length > 0) {
    return fromTable;
  }

  const fromItems = queryAll<{ category: string }>(
    'SELECT DISTINCT category FROM inventory_items WHERE category IS NOT NULL AND trim(category) != "" ORDER BY category COLLATE NOCASE',
  ).map((row) => row.category);

  return fromItems.length > 0 ? fromItems : ['other'];
}

export function addInventoryCategory(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Category name is required.');
  }

  const existing = queryOne<{ name: string }>(
    'SELECT name FROM inventory_categories WHERE name = ? COLLATE NOCASE',
    [normalized],
  );
  if (existing) {
    throw new Error(`Category "${existing.name}" already exists.`);
  }

  insertRow('INSERT INTO inventory_categories (name) VALUES (?)', [normalized]);
  return normalized;
}

// ── Recipes ────────────────────────────────────────────────

function attachRecipeNutrients(recipes: Recipe[]): RecipeView[] {
  const nutrients = queryAll<RecipeNutrient>(
    'SELECT * FROM recipe_nutrients ORDER BY id',
  );
  const byRecipe = new Map<number, RecipeNutrient[]>();
  for (const row of nutrients) {
    const bucket = byRecipe.get(row.recipe_id) ?? [];
    bucket.push(row);
    byRecipe.set(row.recipe_id, bucket);
  }
  return recipes.map((recipe) => ({
    ...recipe,
    nutrients: byRecipe.get(recipe.id) ?? [],
  }));
}

function persistRecipeNutrients(recipeId: number, nutrients: RecipeNutrientInput[]): void {
  runQuery('DELETE FROM recipe_nutrients WHERE recipe_id = ?', [recipeId]);
  nutrients
    .filter((n) => n.amount > 0 && n.name.trim())
    .forEach((n) => {
      const name = n.name.trim();
      const item = findInventoryItem('nutrients', name);
      insertRow(
        `INSERT INTO recipe_nutrients (recipe_id, name, amount, unit, inventory_item_id, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          recipeId,
          name,
          n.amount,
          normalizeNutrientUnit(n.unit),
          item?.id ?? n.inventory_item_id ?? null,
          n.notes ?? '',
        ],
      );
    });
}

export function getMashBatchNutrients(mashBatchId: number): MashBatchNutrient[] {
  return queryAll<MashBatchNutrient>(
    `SELECT id, mash_batch_id, name, lbs AS amount,
            COALESCE(NULLIF(unit, ''), 'lbs') AS unit
     FROM mash_batch_nutrients
     WHERE mash_batch_id = ?
     ORDER BY id`,
    [mashBatchId],
  );
}

function persistMashBatchNutrients(mashBatchId: number, nutrients: MashBatchNutrientInput[]): void {
  runQuery('DELETE FROM mash_batch_nutrients WHERE mash_batch_id = ?', [mashBatchId]);
  nutrients
    .filter((n) => n.amount > 0 && n.name.trim())
    .forEach((n) => {
      insertRow(
        'INSERT INTO mash_batch_nutrients (mash_batch_id, name, lbs, unit) VALUES (?, ?, ?, ?)',
        [mashBatchId, n.name.trim(), n.amount, normalizeNutrientUnit(n.unit)],
      );
    });
}

function nutrientUsageByName(rows: MashBatchNutrientInput[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name || row.amount <= 0) continue;
    const item = findInventoryItem('nutrients', name);
    const inventoryUnit = item?.unit?.trim() || 'lbs';
    const qty = nutrientAmountInUnit(row.amount, row.unit || 'lbs', inventoryUnit);
    map.set(name, (map.get(name) ?? 0) + qty);
  }
  return map;
}

function applyMashNutrientInventory(
  previous: MashBatchNutrientInput[],
  next: MashBatchNutrientInput[],
): void {
  const prevMap = nutrientUsageByName(previous);
  const nextMap = nutrientUsageByName(next);
  const names = new Set([...prevMap.keys(), ...nextMap.keys()]);
  for (const name of names) {
    const prevLbs = prevMap.get(name) ?? 0;
    const nextLbs = nextMap.get(name) ?? 0;
    applyInventoryDelta('nutrients', name, prevLbs - nextLbs);
  }
}

export function getRecipes(): RecipeView[] {
  const recipes = queryAll<Recipe>('SELECT * FROM recipes ORDER BY name');
  return attachRecipeNutrients(recipes);
}

export function getRecipe(id: number): RecipeView | undefined {
  const recipe = queryOne<Recipe>('SELECT * FROM recipes WHERE id = ?', [id]);
  if (!recipe) return undefined;
  return attachRecipeNutrients([recipe])[0];
}

export function saveRecipe(
  recipe: Omit<Recipe, 'id' | 'created_at' | 'updated_at'>,
  id?: number,
  nutrients: RecipeNutrientInput[] = [],
): number {
  let recipeId = id;
  if (recipeId) {
    runQuery(
      `UPDATE recipes SET name=?, spirit_type=?, grain_type=?, grain_lbs=?, water_gal=?, yeast_strain=?, yeast_lbs=?, target_brix=?, target_final_brix=?, notes=?, updated_at=datetime('now') WHERE id=?`,
      [
        recipe.name,
        recipe.spirit_type,
        recipe.grain_type,
        recipe.grain_lbs,
        recipe.water_gal,
        recipe.yeast_strain,
        recipe.yeast_lbs,
        recipe.target_brix,
        recipe.target_final_brix,
        recipe.notes,
        recipeId,
      ],
    );
  } else {
    recipeId = insertRow(
      `INSERT INTO recipes (name, spirit_type, grain_type, grain_lbs, water_gal, yeast_strain, yeast_lbs, target_brix, target_final_brix, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipe.name,
        recipe.spirit_type,
        recipe.grain_type,
        recipe.grain_lbs,
        recipe.water_gal,
        recipe.yeast_strain,
        recipe.yeast_lbs,
        recipe.target_brix,
        recipe.target_final_brix,
        recipe.notes,
      ],
    );
  }
  persistRecipeNutrients(recipeId, nutrients);
  return recipeId;
}

export function deleteRecipe(id: number): void {
  runQuery('DELETE FROM recipe_nutrients WHERE recipe_id = ?', [id]);
  runQuery('DELETE FROM recipes WHERE id = ?', [id]);
}

// ── Wash & Fermentation ────────────────────────────────────

export function getMashBatches(): MashBatch[] {
  return queryAll<MashBatch>(
    'SELECT * FROM mash_batches ORDER BY start_date DESC',
  );
}

export function getMashBatch(id: number): MashBatch | undefined {
  return queryOne<MashBatch>('SELECT * FROM mash_batches WHERE id = ?', [id]) ?? undefined;
}

export function saveMashBatch(batch: Omit<MashBatch, 'id' | 'created_at'>, id?: number): number {
  if (id) {
    runQuery(
      `UPDATE mash_batches SET batch_number=?, recipe_name=?, grain_type=?, grain_lbs=?, water_gal=?, yeast_strain=?, yeast_lbs=?, start_date=?, target_brix=?, actual_brix=?, target_final_brix=?, status=?, assigned_user_id=?, assigned_user_name=?, notes=? WHERE id=?`,
      [batch.batch_number, batch.recipe_name, batch.grain_type, batch.grain_lbs, batch.water_gal, batch.yeast_strain, batch.yeast_lbs, batch.start_date, batch.target_brix, batch.actual_brix, batch.target_final_brix, batch.status, batch.assigned_user_id, batch.assigned_user_name ?? '', batch.notes, id],
    );
    return id;
  }
  return insertRow(
    `INSERT INTO mash_batches (batch_number, recipe_name, grain_type, grain_lbs, water_gal, yeast_strain, yeast_lbs, start_date, target_brix, actual_brix, target_final_brix, actual_final_brix, status, assigned_user_id, assigned_user_name, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batch.batch_number, batch.recipe_name, batch.grain_type, batch.grain_lbs, batch.water_gal, batch.yeast_strain, batch.yeast_lbs, batch.start_date, batch.target_brix, batch.actual_brix, batch.target_final_brix, batch.actual_final_brix, batch.status, batch.assigned_user_id, batch.assigned_user_name ?? '', batch.notes],
  );
}

function applyMashInventoryUsage(
  next: Omit<MashBatch, 'id' | 'created_at'>,
  previous?: MashBatch,
  previousNutrients: MashBatchNutrientInput[] = [],
  nextNutrients: MashBatchNutrientInput[] = [],
): void {
  const prevSugar = previous?.grain_type ?? '';
  const nextSugar = next.grain_type ?? '';
  const prevSugarLbs = previous?.grain_lbs ?? 0;
  const nextSugarLbs = next.grain_lbs ?? 0;

  if (prevSugar.trim().toLowerCase() === nextSugar.trim().toLowerCase()) {
    applyInventoryDelta('sugar', nextSugar, prevSugarLbs - nextSugarLbs);
  } else {
    applyInventoryDelta('sugar', prevSugar, prevSugarLbs);
    applyInventoryDelta('sugar', nextSugar, -nextSugarLbs);
  }

  const prevYeast = previous?.yeast_strain ?? '';
  const nextYeast = next.yeast_strain ?? '';
  const prevYeastLbs = previous?.yeast_lbs ?? 0;
  const nextYeastLbs = next.yeast_lbs ?? 0;

  if (prevYeast.trim().toLowerCase() === nextYeast.trim().toLowerCase()) {
    applyInventoryDelta('yeast', nextYeast, prevYeastLbs - nextYeastLbs);
  } else {
    applyInventoryDelta('yeast', prevYeast, prevYeastLbs);
    applyInventoryDelta('yeast', nextYeast, -nextYeastLbs);
  }

  applyMashNutrientInventory(previousNutrients, nextNutrients);
}

export interface FermenterAssignmentInput {
  equipmentId: number;
  volumeGal: number;
  status?: FermentationAssignmentStatus;
}

function assignmentStatus(status: string | null | undefined): FermentationAssignmentStatus {
  if (status === 'complete' || status === 'discarded') return status;
  return 'fermenting';
}

export function getMashFermenterAssignments(mashBatchId: number): (MashFermenterAssignment & { equipment_name: string })[] {
  return queryAll(
    `SELECT a.*, fe.name as equipment_name
     FROM mash_fermenter_assignments a
     JOIN floor_equipment fe ON fe.id = a.floor_equipment_id
     WHERE a.mash_batch_id = ?
     ORDER BY a.id`,
    [mashBatchId],
  );
}

export function getAllMashFermenterAssignments(): (MashFermenterAssignment & { equipment_name: string; batch_number: string })[] {
  return queryAll(
    `SELECT a.*, fe.name as equipment_name, m.batch_number
     FROM mash_fermenter_assignments a
     JOIN floor_equipment fe ON fe.id = a.floor_equipment_id
     JOIN mash_batches m ON m.id = a.mash_batch_id
     ORDER BY m.start_date DESC`,
  );
}

export function isFermenterAvailable(equipmentId: number, forMashBatchId?: number): boolean {
  const active = queryOne<{ mash_batch_id: number }>(`
    SELECT a.mash_batch_id FROM mash_fermenter_assignments a
    JOIN mash_batches m ON m.id = a.mash_batch_id
    WHERE a.floor_equipment_id = ?
      AND a.volume_gal > 0.01
      AND COALESCE(a.status, 'fermenting') != 'discarded'
      AND m.status IN ('fermenting', 'complete')
  `, [equipmentId]);
  if (!active) return true;
  return forMashBatchId !== undefined && active.mash_batch_id === forMashBatchId;
}

export interface FermenterWashSourceOption extends MashFermenterAssignment {
  equipment_name: string;
  batch_number: string;
  recipe_name: string;
}

/** @deprecated Use FermenterWashSourceOption */
export type HeavyRumSourceFermenterOption = FermenterWashSourceOption;

/** Fermenters holding wash (fermenting or fermentation complete) — distillation source picker. */
export function getFermenterWashSourceFermenters(
  excludeRunId?: number,
): FermenterWashSourceOption[] {
  const rows = queryAll<{
    id: number;
    mash_batch_id: number;
    floor_equipment_id: number;
    volume_gal: number;
    status: FermentationAssignmentStatus;
    equipment_name: string;
    batch_number: string;
    recipe_name: string;
  }>(`
    SELECT a.id, a.mash_batch_id, a.floor_equipment_id, a.volume_gal, a.status,
           fe.name as equipment_name, m.batch_number, m.recipe_name
    FROM mash_fermenter_assignments a
    JOIN mash_batches m ON m.id = a.mash_batch_id
    JOIN floor_equipment fe ON fe.id = a.floor_equipment_id
    WHERE a.volume_gal > 0.01
      AND COALESCE(a.status, 'fermenting') != 'discarded'
      AND m.status IN ('fermenting', 'complete')
      AND fe.equipment_type = 'fermenter'
    ORDER BY fe.name COLLATE NOCASE, m.batch_number COLLATE NOCASE
  `);

  const options: FermenterWashSourceOption[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const chargeable = getChargeableFermentersForMash(row.mash_batch_id, excludeRunId);
    if (!chargeable.some((c) => c.floor_equipment_id === row.floor_equipment_id)) continue;
    const key = `${row.mash_batch_id}:${row.floor_equipment_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      id: row.id,
      mash_batch_id: row.mash_batch_id,
      floor_equipment_id: row.floor_equipment_id,
      volume_gal: row.volume_gal,
      status: assignmentStatus(row.status),
      equipment_name: row.equipment_name,
      batch_number: row.batch_number,
      recipe_name: row.recipe_name,
    });
  }
  return options;
}

export function getHeavyRumSourceFermenters(
  excludeRunId?: number,
): FermenterWashSourceOption[] {
  return getFermenterWashSourceFermenters(excludeRunId);
}

export function getChargeableFermentersForMash(
  mashBatchId: number,
  excludeRunId?: number,
): (MashFermenterAssignment & { equipment_name: string })[] {
  const assignments = getMashFermenterAssignments(mashBatchId);
  return assignments.filter((a) => {
    if (a.volume_gal <= 0.01) return false;
    if (assignmentStatus(a.status) === 'discarded') return false;
    const washRunUsingFermenter = queryOne<{ id: number }>(
      `SELECT id FROM distillation_runs
       WHERE source_mash_batch_id = ?
         AND source_fermenter_equipment_id = ?
         AND run_type = 'wash'
         AND status IN ('running', 'complete')
         AND (? IS NULL OR id != ?)
       LIMIT 1`,
      [mashBatchId, a.floor_equipment_id, excludeRunId ?? null, excludeRunId ?? -1],
    );
    return !washRunUsingFermenter;
  });
}

/** Wash left in fermenter assignment, plus charge already on an edited heavy rum run. */
export function getFermenterChargeCapacityGal(
  mashBatchId: number,
  equipmentId: number,
  excludeRunId?: number,
): number {
  const assignment = queryOne<{ volume_gal: number }>(
    'SELECT volume_gal FROM mash_fermenter_assignments WHERE mash_batch_id = ? AND floor_equipment_id = ?',
    [mashBatchId, equipmentId],
  );
  let available = assignment?.volume_gal ?? 0;
  if (excludeRunId) {
    const run = queryOne<{ charge_volume_gal: number; run_type: string }>(
      'SELECT charge_volume_gal, run_type FROM distillation_runs WHERE id = ?',
      [excludeRunId],
    );
    if (run?.run_type === 'heavy_rum') {
      available += run.charge_volume_gal ?? 0;
    }
  }
  return available;
}

export function getAvailableFermenters(forMashBatchId?: number): FloorEquipment[] {
  return onlyProductionUsable(getFloorEquipment().filter(
    (e) => e.equipment_type === 'fermenter' && isFermenterAvailable(e.id, forMashBatchId),
  ));
}

type EquipmentListOptions = { includeUnavailable?: boolean };

function listForProduction<T extends FloorEquipment>(
  items: T[],
  options?: EquipmentListOptions,
): T[] {
  return options?.includeUnavailable ? items : onlyProductionUsable(items);
}

export function getPotStills(options?: EquipmentListOptions): FloorEquipment[] {
  return listForProduction(getFloorEquipment().filter(
    (e) => e.equipment_type === 'pot_still' || e.equipment_type === 'column_still',
  ), options);
}

export function getStillCapacityByName(stillName: string): number | null {
  const trimmed = stillName.trim();
  if (!trimmed) return null;
  const row = queryOne<{ capacity_gal: number }>(
    `SELECT capacity_gal FROM floor_equipment
     WHERE name = ? AND equipment_type IN ('pot_still', 'column_still')`,
    [trimmed],
  );
  return row?.capacity_gal ?? null;
}

export function getActiveDistillationRunOnStill(
  stillName: string,
  excludeRunId?: number,
): { id: number; batch_number: string; status: string; charge_volume_gal: number } | undefined {
  const trimmed = stillName.trim();
  if (!trimmed) return undefined;
  return queryOne<{ id: number; batch_number: string; status: string; charge_volume_gal: number }>(
    `SELECT id, batch_number, status, charge_volume_gal FROM distillation_runs
     WHERE still_name = ? AND status = 'running'
     AND (? IS NULL OR id != ?)
     LIMIT 1`,
    [trimmed, excludeRunId ?? null, excludeRunId ?? -1],
  ) ?? undefined;
}

/** Running run first, otherwise a planned run, so the process menu can open cuts. */
export function getDistillationRunForCuts(
  stillName: string,
): { id: number; batch_number: string; status: string } | undefined {
  const trimmed = stillName.trim();
  if (!trimmed) return undefined;
  return queryOne<{ id: number; batch_number: string; status: string }>(
    `SELECT id, batch_number, status FROM distillation_runs
     WHERE still_name = ? AND status IN ('running', 'planned')
     ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [trimmed],
  ) ?? undefined;
}

function assertStillAvailableForCharge(stillName: string, excludeRunId?: number): void {
  const occupied = getActiveDistillationRunOnStill(stillName, excludeRunId);
  if (!occupied) return;
  throw new Error(
    stillAlreadyOccupiedMessage(
      stillName.trim(),
      occupied.batch_number,
      occupied.status,
      occupied.charge_volume_gal,
    ),
  );
}

export function getHoldingTanks(options?: EquipmentListOptions): FloorEquipment[] {
  syncHoldingTankStatuses();
  return listForProduction(
    getFloorEquipment().filter((e) => e.equipment_type === 'holding_tank'),
    options,
  );
}

export function getCollectionVessels(options?: EquipmentListOptions): FloorEquipment[] {
  syncHoldingTankStatuses();
  return listForProduction(
    getFloorEquipment().filter((e) => e.equipment_type === 'collection_vessel'),
    options,
  );
}

export function getStillageTanks(options?: EquipmentListOptions): FloorEquipment[] {
  syncHoldingTankStatuses();
  return listForProduction(
    getFloorEquipment().filter((e) => isStillageTankType(e.equipment_type)),
    options,
  );
}

/** Cut type of the spirit still in the vessel. Empty vessels are not locked to a run or a cut. */
export function getCollectionVesselStoredCutType(
  vesselId: number,
  excludeCutId?: number,
): StoredCutType | null {
  let volume = getHoldingTankContents(vesselId).volume_gal;
  if (excludeCutId) {
    const excluded = queryOne<{ volume_gal: number; holding_tank_equipment_id: number | null; status: string }>(
      `SELECT c.volume_gal, c.holding_tank_equipment_id, r.status
       FROM distillation_cuts c
       JOIN distillation_runs r ON r.id = c.distillation_run_id
       WHERE c.id = ?`,
      [excludeCutId],
    );
    if (
      excluded?.holding_tank_equipment_id === vesselId
      && runConsumesSource(excluded.status)
    ) {
      volume -= excluded.volume_gal;
    }
  }

  const cuts = queryAll<{ cut_type: CutType; volume_gal: number; occurred_at: string }>(
    `SELECT c.cut_type, c.volume_gal, c.start_time as occurred_at
     FROM distillation_cuts c
     JOIN distillation_runs r ON r.id = c.distillation_run_id
     WHERE c.holding_tank_equipment_id = ?
       AND c.volume_gal > 0
       AND r.status IN ('running', 'complete')
       AND (? IS NULL OR c.id != ?)`,
    [vesselId, excludeCutId ?? null, excludeCutId ?? 0],
  );
  const transfers = queryAll<{
    volume_gal: number;
    occurred_at: string;
    source_tank_equipment_id: number;
  }>(
    `SELECT volume_gal, transfer_date as occurred_at, source_tank_equipment_id
     FROM holding_tank_transfers
     WHERE dest_tank_equipment_id = ?
       AND volume_gal > 0`,
    [vesselId],
  );

  const stillage = queryAll<{ volume_gal: number; occurred_at: string }>(`
    SELECT stillage_volume_gal as volume_gal, run_date as occurred_at
    FROM distillation_runs
    WHERE stillage_holding_tank_equipment_id = ?
      AND status = 'complete'
      AND COALESCE(stillage_discarded, 0) = 0
      AND stillage_volume_gal > 0
  `, [vesselId]);

  const inflows = [
    ...cuts.map((cut) => ({
      occurredAt: cut.occurred_at,
      volumeGal: cut.volume_gal,
      cutType: cut.cut_type as CutType,
    })),
    ...transfers.map((transfer) => ({
      occurredAt: transfer.occurred_at,
      volumeGal: transfer.volume_gal,
      cutType: singleCutTypeOnEquipment(transfer.source_tank_equipment_id),
    })),
    ...stillage.map((row) => ({
      occurredAt: row.occurred_at,
      volumeGal: row.volume_gal,
      cutType: null as CutType | null,
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return storedCutTypeFromInflows(inflows, volume);
}

/** Cut type from cuts on a vessel, without following transfers (avoids a lookup loop). */
function singleCutTypeOnEquipment(equipmentId: number): CutType | null {
  const volume = getHoldingTankContents(equipmentId).volume_gal;
  const cuts = queryAll<{ cut_type: CutType; volume_gal: number; occurred_at: string }>(
    `SELECT c.cut_type, c.volume_gal, c.start_time as occurred_at
     FROM distillation_cuts c
     JOIN distillation_runs r ON r.id = c.distillation_run_id
     WHERE c.holding_tank_equipment_id = ?
       AND c.volume_gal > 0
       AND r.status IN ('running', 'complete')
     ORDER BY c.start_time DESC`,
    [equipmentId],
  );
  const stored = storedCutTypeFromInflows(
    cuts.map((cut) => ({ volumeGal: cut.volume_gal, cutType: cut.cut_type })),
    volume,
  );
  return stored === 'mixed' || stored == null ? null : stored;
}

export function collectionVesselAcceptsCutType(
  vesselId: number,
  cutType: CutType,
  excludeCutId?: number,
): boolean {
  return collectionVesselAcceptsIncomingCut(
    getCollectionVesselStoredCutType(vesselId, excludeCutId),
    cutType,
  );
}

/** Collection vessels that are empty or already hold this cut type only. */
export function getCollectionVesselsForCutType(
  cutType: CutType,
  excludeCutId?: number,
  options?: EquipmentListOptions,
): FloorEquipment[] {
  return getCollectionVessels(options).filter((v) =>
    collectionVesselAcceptsCutType(v.id, cutType, excludeCutId),
  );
}

/** Holding tanks, stillage tanks, and collection vessels — equipment on the spirit ledger. */
export function getSpiritTransferVessels(): FloorEquipment[] {
  syncHoldingTankStatuses();
  return onlyProductionUsable(getFloorEquipment().filter(
    (e) => isSpiritLedgerEquipmentType(e.equipment_type),
  ));
}

export function getSpiritTransferVesselsWithContents(): (FloorEquipment & HoldingTankContents)[] {
  return getSpiritTransferVessels().map((tank) => ({
    ...tank,
    ...getHoldingTankContents(tank.id),
  }));
}

function assertSpiritTransferVessel(equipmentId: number, role: 'source' | 'destination'): void {
  const row = queryOne<{ equipment_type: string; name: string }>(
    'SELECT equipment_type, name FROM floor_equipment WHERE id = ?',
    [equipmentId],
  );
  if (!row) {
    throw new Error(`${role === 'source' ? 'Source' : 'Destination'} tank not found.`);
  }
  if (!isSpiritLedgerEquipmentType(row.equipment_type)) {
    throw new Error(`${row.name} cannot be used for spirit transfers — choose a holding tank, stillage tank, or collection vessel.`);
  }
}

/** Gallons of tails removed from a source tank. Proofing water stays out of that total. */
const TANK_CHARGE_DRAWN_GAL_SQL = `
  CASE
    WHEN COALESCE(proof_water_gal, 0) > 0.001 AND proof_spirit_gal IS NOT NULL
    THEN proof_spirit_gal
    ELSE charge_volume_gal
  END
`;

/** Alcohol gallons removed from a source tank, using the tails ABV before proofing water. */
const TANK_CHARGE_DRAWN_GPA_SQL = `
  CASE
    WHEN COALESCE(proof_water_gal, 0) > 0.001 AND proof_spirit_gal IS NOT NULL
    THEN proof_spirit_gal * COALESCE(proof_spirit_abv, 0) / 100.0
    ELSE charge_volume_gal * COALESCE(charge_abv, 0) / 100.0
  END
`;

function computeHoldingTankContents(
  tankId: number,
  excludeRunId?: number,
  excludeBlendId?: number,
  excludeBottlingRunId?: number,
): HoldingTankContents & { production_volume_gal: number; production_gpa: number } {
  const ins = queryOne<{ volume_gal: number; gpa: number; run_count: number; cut_count: number }>(`
    SELECT
      COALESCE(SUM(c.volume_gal), 0) as volume_gal,
      COALESCE(SUM(c.volume_gal * c.abv / 100), 0) as gpa,
      COUNT(DISTINCT c.distillation_run_id) as run_count,
      COUNT(*) as cut_count
    FROM distillation_cuts c
    JOIN distillation_runs r ON r.id = c.distillation_run_id
    WHERE c.holding_tank_equipment_id = ?
      AND r.status IN ('running', 'complete')
  `, [tankId]);

  const runOuts = queryOne<{ volume_gal: number; gpa: number }>(`
    SELECT
      COALESCE(SUM(${TANK_CHARGE_DRAWN_GAL_SQL}), 0) as volume_gal,
      COALESCE(SUM(${TANK_CHARGE_DRAWN_GPA_SQL}), 0) as gpa
    FROM distillation_runs
    WHERE source_holding_tank_equipment_id = ?
      AND status IN ('running', 'complete')
      AND (? IS NULL OR id != ?)
  `, [tankId, excludeRunId ?? null, excludeRunId ?? -1]);

  const blendOuts = queryOne<{ volume_gal: number; gpa: number }>(
    blendTankDrawsSql('?', '?'),
    [tankId, excludeBlendId ?? null, excludeBlendId ?? -1],
  );

  const bottlingOuts = queryOne<{ volume_gal: number; gpa: number }>(`
    SELECT
      COALESCE(SUM(source_volume_gal), 0) as volume_gal,
      COALESCE(SUM(source_volume_gal * COALESCE(final_abv, 0) / 100), 0) as gpa
    FROM bottling_runs
    WHERE source_holding_tank_equipment_id = ?
      AND source_volume_gal > 0
      AND (? IS NULL OR id != ?)
  `, [tankId, excludeBottlingRunId ?? null, excludeBottlingRunId ?? -1]);

  const barrelFillOuts = queryOne<{ volume_gal: number; gpa: number }>(`
    SELECT
      COALESCE(SUM(volume_gal), 0) as volume_gal,
      COALESCE(SUM(volume_gal * abv / 100), 0) as gpa
    FROM barrel_fills
    WHERE source_holding_tank_equipment_id = ?
  `, [tankId]);

  const transferIns = queryOne<{ volume_gal: number; gpa: number }>(`
    SELECT
      COALESCE(SUM(volume_gal), 0) as volume_gal,
      COALESCE(SUM(volume_gal * abv / 100), 0) as gpa
    FROM holding_tank_transfers
    WHERE dest_tank_equipment_id = ?
  `, [tankId]);

  const transferOuts = queryOne<{ volume_gal: number; gpa: number }>(`
    SELECT
      COALESCE(SUM(volume_gal), 0) as volume_gal,
      COALESCE(SUM(volume_gal * abv / 100), 0) as gpa
    FROM holding_tank_transfers
    WHERE source_tank_equipment_id = ?
  `, [tankId]);

  const blendIns = queryOne<{ volume_gal: number; gpa: number }>(`
    SELECT
      COALESCE(SUM(final_volume_gal), 0) as volume_gal,
      COALESCE(SUM(final_volume_gal * final_abv / 100), 0) as gpa
    FROM blend_products
    WHERE output_holding_tank_equipment_id = ?
      AND status IN ${BLEND_LEDGER_STATUSES_SQL}
      AND final_volume_gal > 0
  `, [tankId]);

  const stillageIns = queryOne<{ volume_gal: number }>(`
    SELECT COALESCE(SUM(stillage_volume_gal), 0) as volume_gal
    FROM distillation_runs
    WHERE stillage_holding_tank_equipment_id = ?
      AND status = 'complete'
      AND COALESCE(stillage_discarded, 0) = 0
      AND stillage_volume_gal > 0
  `, [tankId]);

  const opening = queryOne<{ volume_gal: number; alcohol_gal: number }>(`
    SELECT volume_gal, alcohol_gal
    FROM holding_tank_opening_balances
    WHERE tank_equipment_id = ?
  `, [tankId]);

  const volumeIn = (ins?.volume_gal ?? 0) + (transferIns?.volume_gal ?? 0) + (blendIns?.volume_gal ?? 0)
    + (stillageIns?.volume_gal ?? 0);
  const volumeOut = (runOuts?.volume_gal ?? 0) + (blendOuts?.volume_gal ?? 0)
    + (bottlingOuts?.volume_gal ?? 0) + (barrelFillOuts?.volume_gal ?? 0) + (transferOuts?.volume_gal ?? 0);
  const gpaIn = (ins?.gpa ?? 0) + (transferIns?.gpa ?? 0) + (blendIns?.gpa ?? 0);
  const gpaOut = (runOuts?.gpa ?? 0) + (blendOuts?.gpa ?? 0)
    + (bottlingOuts?.gpa ?? 0) + (barrelFillOuts?.gpa ?? 0) + (transferOuts?.gpa ?? 0);
  const productionVolume = volumeIn - volumeOut;
  const productionGpa = gpaIn - gpaOut;
  const netVolume = productionVolume + (opening?.volume_gal ?? 0);
  const netGpa = productionGpa + (opening?.alcohol_gal ?? 0);
  const volume_gal = Math.max(0, netVolume);
  const gpaRemaining = Math.max(0, netGpa);
  const abv = volume_gal > 0 ? (gpaRemaining / volume_gal) * 100 : 0;

  return {
    volume_gal,
    abv,
    run_count: ins?.run_count ?? 0,
    cut_count: ins?.cut_count ?? 0,
    production_volume_gal: productionVolume,
    production_gpa: productionGpa,
  };
}

export function getHoldingTankContents(
  tankId: number,
  excludeRunId?: number,
  excludeBlendId?: number,
  excludeBottlingRunId?: number,
): HoldingTankContents {
  const ledger = computeHoldingTankContents(
    tankId,
    excludeRunId,
    excludeBlendId,
    excludeBottlingRunId,
  );
  return {
    volume_gal: ledger.volume_gal,
    abv: ledger.abv,
    run_count: ledger.run_count,
    cut_count: ledger.cut_count,
  };
}

export interface HoldingTankOnHand {
  id: number;
  tank_equipment_id: number;
  measured_volume_gal: number;
  measured_abv: number;
  recorded_at: string;
  notes: string;
}

export interface HoldingTankVolumeVariance {
  id: number;
  tank_equipment_id: number;
  tank_name: string;
  book_volume_gal: number;
  book_abv: number;
  set_volume_gal: number;
  set_abv: number;
  variance_gal: number;
  recorded_at: string;
  notes: string;
}

function recordHoldingTankVolumeVariance(input: {
  tankEquipmentId: number;
  bookVolumeGal: number;
  bookAbv: number;
  setVolumeGal: number;
  setAbv: number;
  recordedAt: string;
  notes: string;
}): void {
  const bookVolume = roundThousandths(input.bookVolumeGal);
  const setVolume = roundThousandths(input.setVolumeGal);
  insertRow(
    `INSERT INTO holding_tank_volume_variances
      (tank_equipment_id, book_volume_gal, book_abv, set_volume_gal, set_abv, variance_gal, recorded_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.tankEquipmentId,
      bookVolume,
      roundThousandths(input.bookAbv),
      setVolume,
      roundThousandths(input.setAbv),
      tankVolumeVarianceGal(bookVolume, setVolume),
      input.recordedAt,
      input.notes,
    ],
  );
}

export function getHoldingTankVolumeVariances(): HoldingTankVolumeVariance[] {
  return queryAll<HoldingTankVolumeVariance>(`
    SELECT v.id, v.tank_equipment_id, e.name as tank_name,
           v.book_volume_gal, v.book_abv, v.set_volume_gal, v.set_abv,
           v.variance_gal, v.recorded_at, v.notes
    FROM holding_tank_volume_variances v
    JOIN floor_equipment e ON e.id = v.tank_equipment_id
    ORDER BY v.recorded_at DESC, v.id DESC
  `);
}

export function getHoldingTankOnHand(tankId: number): HoldingTankOnHand | null {
  return queryOne<HoldingTankOnHand>(
    `SELECT id, tank_equipment_id, measured_volume_gal, measured_abv, recorded_at, notes
     FROM holding_tank_opening_balances
     WHERE tank_equipment_id = ?`,
    [tankId],
  );
}

/** Record the gallons and ABV already in a tank, without inventing a distillation or transfer. */
export function saveHoldingTankOnHand(input: {
  tankEquipmentId: number;
  volumeGal: number;
  abv: number;
  recordedAt: string;
  notes?: string;
}): void {
  assertSpiritTransferVessel(input.tankEquipmentId, 'destination');
  if (!Number.isFinite(input.volumeGal) || input.volumeGal < 0) {
    throw new Error('Enter the gallons on hand.');
  }
  if (!Number.isFinite(input.abv) || input.abv < 0) {
    throw new Error('Enter an ABV from 0 to 99.');
  }
  assertEnteredAbv(input.abv, 'ABV');
  if (!input.recordedAt?.trim()) {
    throw new Error('Enter the date of this reading.');
  }
  const measuredVolume = Math.round(input.volumeGal * 1000) / 1000;
  const measuredAbv = Math.round(input.abv * 1000) / 1000;
  const production = computeHoldingTankContents(input.tankEquipmentId);
  recordHoldingTankVolumeVariance({
    tankEquipmentId: input.tankEquipmentId,
    bookVolumeGal: production.volume_gal,
    bookAbv: production.abv,
    setVolumeGal: measuredVolume,
    setAbv: measuredAbv,
    recordedAt: input.recordedAt,
    notes: input.notes?.trim() ?? '',
  });
  const adjustmentVolume = Math.round((measuredVolume - production.production_volume_gal) * 1000) / 1000;
  const adjustmentAlcohol = Math.round((measuredVolume * measuredAbv / 100 - production.production_gpa) * 1000) / 1000;
  const notes = input.notes?.trim() ?? '';
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM holding_tank_opening_balances WHERE tank_equipment_id = ?',
    [input.tankEquipmentId],
  );
  if (Math.abs(adjustmentVolume) < 0.001 && Math.abs(adjustmentAlcohol) < 0.001) {
    if (existing) {
      runQuery('DELETE FROM holding_tank_opening_balances WHERE id = ?', [existing.id]);
    }
  } else if (existing) {
    runQuery(
      `UPDATE holding_tank_opening_balances
       SET volume_gal = ?, alcohol_gal = ?, measured_volume_gal = ?, measured_abv = ?, recorded_at = ?, notes = ?
       WHERE id = ?`,
      [adjustmentVolume, adjustmentAlcohol, measuredVolume, measuredAbv, input.recordedAt, notes, existing.id],
    );
  } else {
    insertRow(
      `INSERT INTO holding_tank_opening_balances
        (tank_equipment_id, volume_gal, alcohol_gal, measured_volume_gal, measured_abv, recorded_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.tankEquipmentId, adjustmentVolume, adjustmentAlcohol, measuredVolume, measuredAbv, input.recordedAt, notes],
    );
  }
  syncHoldingTankStatuses();
}

export function clearHoldingTankOnHand(tankId: number): void {
  const existing = queryOne<{ notes: string }>(
    'SELECT notes FROM holding_tank_opening_balances WHERE tank_equipment_id = ?',
    [tankId],
  );
  if (!existing) return;
  const ledger = computeHoldingTankContents(tankId);
  const returnedVolume = Math.max(0, ledger.production_volume_gal);
  const returnedGpa = Math.max(0, ledger.production_gpa);
  const returnedAbv = returnedVolume > 0 ? (returnedGpa / returnedVolume) * 100 : 0;
  const priorNotes = existing.notes.trim();
  recordHoldingTankVolumeVariance({
    tankEquipmentId: tankId,
    bookVolumeGal: ledger.volume_gal,
    bookAbv: ledger.abv,
    setVolumeGal: returnedVolume,
    setAbv: returnedAbv,
    recordedAt: localIsoDate(),
    notes: priorNotes ? `On-hand reading removed. ${priorNotes}` : 'On-hand reading removed',
  });
  runQuery('DELETE FROM holding_tank_opening_balances WHERE tank_equipment_id = ?', [tankId]);
  syncHoldingTankStatuses();
}

export function getChargeableHoldingTanks(
  excludeRunId?: number,
  options?: EquipmentListOptions,
): (FloorEquipment & {
  available_gal: number;
  available_abv: number;
})[] {
  return getHoldingTanks(options)
    .map((tank) => {
      const contents = getHoldingTankContents(tank.id, excludeRunId);
      return {
        ...tank,
        available_gal: contents.volume_gal,
        available_abv: contents.abv,
      };
    })
    .filter((tank) => tank.available_gal > 0);
}

export function getHighWinesDestinationTanks(
  excludeTankId?: number | null,
  options?: EquipmentListOptions,
): FloorEquipment[] {
  return getHoldingTanks(options).filter((t) => t.id !== excludeTankId);
}

/** Holding tanks that may receive hearts/tails on a spirit run (high wines / high-proof spirit storage). */
export function getSpiritRunCutHoldingTanks(
  excludeTankId?: number | null,
  options?: EquipmentListOptions,
): FloorEquipment[] {
  return getHighWinesDestinationTanks(excludeTankId, options).filter((t) => {
    const name = t.name.toLowerCase();
    if (name.includes('blending') || name.includes('canning') || name.includes('low wine')) return false;
    return name.includes('spirit') || name.includes('high wine') || name.includes('high wines storage');
  });
}

export function isSpiritRunCutHoldingTank(equipmentId: number): boolean {
  return getSpiritRunCutHoldingTanks().some((t) => t.id === equipmentId);
}

export function getCutDestinationsForRun(
  cutType: CutType,
  runType: string | undefined,
  excludeCutId?: number,
  options?: EquipmentListOptions,
): FloorEquipment[] {
  const vessels = getCollectionVesselsForCutType(cutType, excludeCutId, options);
  if (!isSpiritStyleRun(runType) || cutType === 'heads') return vessels;
  const holding = getSpiritRunCutHoldingTanks(undefined, options);
  const seen = new Set(vessels.map((v) => v.id));
  return [...vessels, ...holding.filter((h) => !seen.has(h.id))];
}

export function getChargeableHoldingTanksForBlend(excludeBlendId?: number): (FloorEquipment & {
  available_gal: number;
  available_abv: number;
})[] {
  return getHoldingTanks()
    .map((tank) => {
      const contents = getHoldingTankContents(tank.id, undefined, excludeBlendId);
      return {
        ...tank,
        available_gal: contents.volume_gal,
        available_abv: contents.abv,
      };
    })
    .filter((tank) => tank.available_gal > 0);
}

export function getChargeableHoldingTanksForBottling(excludeBottlingRunId?: number): (FloorEquipment & {
  available_gal: number;
  available_abv: number;
})[] {
  return getHoldingTanks()
    .map((tank) => {
      const contents = getHoldingTankContents(tank.id, undefined, undefined, excludeBottlingRunId);
      return {
        ...tank,
        available_gal: contents.volume_gal,
        available_abv: contents.abv,
      };
    })
    .filter((tank) => tank.available_gal > 0);
}

export function defaultBlendingOutputTankId(excludeTankIds: number[] = []): number | null {
  const exclude = new Set(excludeTankIds.filter((id) => id > 0));
  const tanks = getHoldingTanks().filter((t) => !exclude.has(t.id));
  const preferred = tanks.find(
    (t) => t.name.toLowerCase().includes('blending') || t.name.toLowerCase().includes('canning'),
  );
  return preferred?.id ?? tanks[0]?.id ?? null;
}

export function defaultHighWinesTankId(excludeTankId?: number | null): number | null {
  const tanks = getHighWinesDestinationTanks(excludeTankId);
  const preferred = tanks.find(
    (t) => t.name.toLowerCase().includes('spirit') || t.name.toLowerCase().includes('high'),
  );
  return preferred?.id ?? tanks[0]?.id ?? null;
}

export function defaultLowWinesTankId(excludeTankId?: number | null): number | null {
  const tanks = getHighWinesDestinationTanks(excludeTankId);
  const preferred = tanks.find((t) => {
    const name = t.name.toLowerCase();
    return name.includes('vendome') && name.includes('low wine');
  });
  return preferred?.id
    ?? findTankByKeywords(['low wines collection', 'vendome'], excludeTankId)
    ?? findTankByKeywords(['low wine', 'low wines'], excludeTankId)
    ?? tanks[0]?.id
    ?? null;
}

/** Hearts on a low wine run (wash) default to the Vendome low wines collection vessel. */
export function defaultLowWineRunHeartsCollectionVesselId(
  excludeTankId?: number | null,
  excludeCutId?: number,
): number | null {
  const vessels = getCollectionVesselsForCutType('hearts', excludeCutId)
    .filter((t) => t.id !== excludeTankId);
  const preferred = vessels.find((t) => {
    const name = t.name.toLowerCase();
    return name.includes('vendome') && name.includes('low wine');
  });
  if (preferred) return preferred.id;
  const byName = vessels.find((t) =>
    t.name.toLowerCase().includes('low wines collection tank of vendome'),
  );
  return byName?.id ?? null;
}

export function defaultDestTankIdForRunType(
  runType: string,
  excludeTankId?: number | null,
): number | null {
  if (runType === 'low_wines') return defaultLowWinesTankId(excludeTankId);
  return null;
}

function findTankByKeywords(keywords: string[], excludeTankId?: number | null): number | null {
  const tanks = getHoldingTanks().filter((t) => t.id !== excludeTankId);
  const match = tanks.find((t) => {
    const name = t.name.toLowerCase();
    return keywords.some((k) => name.includes(k));
  });
  return match?.id ?? null;
}

function findCollectionVesselByKeywords(
  keywords: string[],
  excludeTankId?: number | null,
  cutType?: CutType,
  excludeCutId?: number,
): number | null {
  const vessels = (cutType != null
    ? getCollectionVesselsForCutType(cutType, excludeCutId)
    : getCollectionVessels()
  ).filter((t) => t.id !== excludeTankId);
  const match = vessels.find((t) => {
    const name = t.name.toLowerCase();
    return keywords.some((k) => name.includes(k));
  });
  return match?.id ?? vessels[0]?.id ?? null;
}

function tankVolumeInflows(tankId: number, seen: Set<number>): VesselInflow[] {
  const cuts = queryAll<{ cut_type: CutType; volume_gal: number; occurred_at: string }>(`
    SELECT c.cut_type, c.volume_gal, c.start_time as occurred_at
    FROM distillation_cuts c
    JOIN distillation_runs r ON r.id = c.distillation_run_id
    WHERE c.holding_tank_equipment_id = ?
      AND c.volume_gal > 0
      AND r.status IN ('running', 'complete')
  `, [tankId]);
  const transfers = queryAll<{
    volume_gal: number;
    occurred_at: string;
    source_tank_equipment_id: number;
  }>(`
    SELECT volume_gal, transfer_date as occurred_at, source_tank_equipment_id
    FROM holding_tank_transfers
    WHERE dest_tank_equipment_id = ?
      AND volume_gal > 0
  `, [tankId]);
  const stillage = queryAll<{ volume_gal: number; occurred_at: string }>(`
    SELECT stillage_volume_gal as volume_gal, run_date as occurred_at
    FROM distillation_runs
    WHERE stillage_holding_tank_equipment_id = ?
      AND status = 'complete'
      AND COALESCE(stillage_discarded, 0) = 0
      AND stillage_volume_gal > 0
  `, [tankId]);
  return [
    ...cuts.map((cut) => ({
      occurredAt: cut.occurred_at,
      volumeGal: cut.volume_gal,
      cutType: cut.cut_type,
      stillage: false,
    })),
    ...transfers.map((transfer) => ({
      occurredAt: transfer.occurred_at,
      volumeGal: transfer.volume_gal,
      cutType: null as CutType | null,
      stillage: sourceHoldsStillage(transfer.source_tank_equipment_id, seen),
    })),
    ...stillage.map((row) => ({
      occurredAt: row.occurred_at,
      volumeGal: row.volume_gal,
      cutType: null as CutType | null,
      stillage: true,
    })),
  ]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map(({ volumeGal, cutType, stillage }) => ({ volumeGal, cutType, stillage }));
}

/**
 * True when this tank's gallons are stillage.
 * An empty stillage tank still counts, so stillage moved out of it stays stillage.
 */
function sourceHoldsStillage(tankId: number, seen = new Set<number>()): boolean {
  if (seen.has(tankId) || seen.size > 8) return false;
  seen.add(tankId);
  const tank = queryOne<{ equipment_type: string }>(
    'SELECT equipment_type FROM floor_equipment WHERE id = ?',
    [tankId],
  );
  if (!tank) return false;
  const volume = getHoldingTankContents(tankId).volume_gal;
  if (volume <= 0.05) return isStillageTankType(tank.equipment_type);
  const inflows = tankVolumeInflows(tankId, seen);
  if (inflowsAreStillageOnly(inflows, volume)) return true;
  if (!isStillageTankType(tank.equipment_type)) return false;
  return !inflowsIncludeNonStillage(inflows, volume);
}

/** True when the gallons available to transfer are stillage. */
export function transferSourceIsStillage(tankId: number): boolean {
  if (getHoldingTankContents(tankId).volume_gal <= 0.05) return false;
  return sourceHoldsStillage(tankId);
}

function assertStillageTransferDestination(sourceId: number, destId: number | null): void {
  const sourceIsStillage = transferSourceIsStillage(sourceId);
  if (destId == null) {
    const message = stillageTransferError({
      sourceIsStillage,
      destIsStillageTank: false,
      destName: 'Discarded',
      destDiscarded: true,
    });
    if (message) throw new Error(message);
    return;
  }
  const dest = queryOne<{ equipment_type: string; name: string }>(
    'SELECT equipment_type, name FROM floor_equipment WHERE id = ?',
    [destId],
  );
  if (!dest) return;
  const message = stillageTransferError({
    sourceIsStillage,
    destIsStillageTank: isStillageTankType(dest.equipment_type),
    destName: dest.name,
  });
  if (message) throw new Error(message);
}

function assertCollectionVesselCutTransfer(sourceId: number, destId: number): void {
  if (!isCollectionVesselEquipmentId(destId)) return;
  if (transferSourceIsStillage(sourceId)) return;
  const destCut = getCollectionVesselStoredCutType(destId);
  const sourceCut = getCollectionVesselStoredCutType(sourceId);
  if (sourceCut === 'mixed') {
    throw new Error(
      'That source holds more than one cut. Do not transfer a mix of heads, hearts, and tails into a collection vessel.',
    );
  }
  if (destCut === 'mixed') {
    throw new Error(
      'That collection vessel already holds more than one cut. Empty it before transferring into it.',
    );
  }
  if (destCut && sourceCut && destCut !== sourceCut) {
    throw new Error(collectionVesselCutMixMessage(destCut, sourceCut));
  }
  if (destCut && !sourceCut) {
    throw new Error(
      `This collection vessel already holds ${destCut}. Only transfer ${destCut} into it.`,
    );
  }
}

function isCollectionVesselEquipmentId(equipmentId: number): boolean {
  const row = queryOne<{ equipment_type: string }>(
    'SELECT equipment_type FROM floor_equipment WHERE id = ?',
    [equipmentId],
  );
  return row?.equipment_type === 'collection_vessel';
}

/** Suggested holding tank for a cut type; reuses tank from an earlier cut of the same type on this run. */
export function defaultTankForCutType(
  cutType: CutType,
  options?: {
    run?: Pick<DistillationRun, 'run_type' | 'dest_holding_tank_equipment_id' | 'source_holding_tank_equipment_id'>;
    existingCuts?: Pick<DistillationCut, 'cut_type' | 'holding_tank_equipment_id'>[];
    excludeTankId?: number | null;
    excludeCutId?: number;
  },
): number | null {
  const { run, existingCuts, excludeTankId, excludeCutId } = options ?? {};
  const priorSameType = existingCuts?.find(
    (c) => c.cut_type === cutType && c.holding_tank_equipment_id,
  );
  if (
    priorSameType?.holding_tank_equipment_id
    && isCollectionVesselEquipmentId(priorSameType.holding_tank_equipment_id)
    && collectionVesselAcceptsCutType(priorSameType.holding_tank_equipment_id, cutType, excludeCutId)
  ) {
    return priorSameType.holding_tank_equipment_id;
  }

  switch (cutType) {
    case 'heads':
      return null;
    case 'hearts':
      if (run?.run_type === 'wash') {
        const lowWineHearts = defaultLowWineRunHeartsCollectionVesselId(excludeTankId, excludeCutId);
        if (lowWineHearts) return lowWineHearts;
      }
      if (isSpiritStyleRun(run?.run_type)) {
        const highWinesTank = defaultHighWinesTankId(excludeTankId);
        if (highWinesTank) return highWinesTank;
      }
      if (
        run?.run_type === 'heavy_rum'
        && run.dest_holding_tank_equipment_id
        && isCollectionVesselEquipmentId(run.dest_holding_tank_equipment_id)
        && collectionVesselAcceptsCutType(run.dest_holding_tank_equipment_id, cutType, excludeCutId)
      ) {
        return run.dest_holding_tank_equipment_id;
      }
      return findCollectionVesselByKeywords(
        ['latina', 'vendome', 'collection'],
        excludeTankId,
        cutType,
        excludeCutId,
      );
    case 'tails':
      return findCollectionVesselByKeywords(
        ['latina', 'low wine', 'vendome', 'collection'],
        excludeTankId,
        cutType,
        excludeCutId,
      );
    default:
      return null;
  }
}

export function holdingTankIntakeKey(entry: Pick<HoldingTankIntakeEntry, 'kind' | 'id'>): string {
  return `${entry.kind}:${entry.id}`;
}

/** Recent cuts and transfers that added spirit to a holding tank (newest first). */
export function getHoldingTankIntakeHistory(
  tankId: number,
  limit = 5,
): HoldingTankIntakeEntry[] {
  const cuts = queryAll<{
    id: number;
    distillation_run_id: number;
    occurred_at: string;
    cut_type: string;
    volume_gal: number;
    abv: number;
    notes: string;
    batch_number: string;
    run_type: string;
    still_name: string;
    mash_batch: string | null;
  }>(`
    SELECT
      c.id,
      r.id as distillation_run_id,
      c.start_time as occurred_at,
      c.cut_type,
      c.volume_gal,
      c.abv,
      c.notes,
      r.batch_number,
      r.run_type,
      r.still_name,
      m.batch_number as mash_batch
    FROM distillation_cuts c
    JOIN distillation_runs r ON r.id = c.distillation_run_id
    LEFT JOIN mash_batches m ON m.id = r.source_mash_batch_id
    WHERE c.holding_tank_equipment_id = ?
      AND c.volume_gal > 0
  `, [tankId]);

  const transfers = queryAll<{
    id: number;
    occurred_at: string;
    volume_gal: number;
    abv: number;
    notes: string;
    source_tank_name: string;
  }>(`
    SELECT
      t.id,
      COALESCE(t.created_at, t.transfer_date) as occurred_at,
      t.volume_gal,
      t.abv,
      t.notes,
      src.name as source_tank_name
    FROM holding_tank_transfers t
    JOIN floor_equipment src ON src.id = t.source_tank_equipment_id
    WHERE t.dest_tank_equipment_id = ?
  `, [tankId]);

  const blends = queryAll<{
    id: number;
    occurred_at: string;
    volume_gal: number;
    abv: number;
    batch_number: string;
    product_name: string;
    notes: string;
  }>(`
    SELECT
      id,
      COALESCE(executed_at, created_at) as occurred_at,
      final_volume_gal as volume_gal,
      final_abv as abv,
      batch_number,
      product_name,
      notes
    FROM blend_products
    WHERE output_holding_tank_equipment_id = ?
      AND status IN ${BLEND_LEDGER_STATUSES_SQL}
      AND final_volume_gal > 0
  `, [tankId]);

  const runTypeLabels: Record<string, string> = {
    wash: 'low wine run',
    low_wines: 'spirit run',
    gin: 'gin run',
    heavy_rum: 'heavy rum run',
  };

  const entries: HoldingTankIntakeEntry[] = [
    ...cuts.map((c) => {
      const cutLabel = c.cut_type.charAt(0).toUpperCase() + c.cut_type.slice(1);
      const runLabel = runTypeLabels[c.run_type] ?? c.run_type;
      const detailParts = [c.still_name, c.mash_batch ? `wash ${c.mash_batch}` : null].filter(Boolean);
      return {
        kind: 'cut' as const,
        id: c.id,
        distillationRunId: c.distillation_run_id,
        occurred_at: c.occurred_at,
        volume_gal: c.volume_gal,
        abv: c.abv,
        summary: `${cutLabel} from ${c.batch_number} (${runLabel})`,
        detail: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
        notes: c.notes?.trim() || undefined,
      };
    }),
    ...transfers.map((t) => ({
      kind: 'transfer' as const,
      id: t.id,
      occurred_at: t.occurred_at,
      volume_gal: t.volume_gal,
      abv: t.abv,
      summary: `Transfer from ${t.source_tank_name}`,
      detail: undefined,
      notes: t.notes?.trim() || undefined,
    })),
    ...blends.map((b) => ({
      kind: 'blend' as const,
      id: b.id,
      occurred_at: b.occurred_at,
      volume_gal: b.volume_gal,
      abv: b.abv,
      summary: `Blend ${b.batch_number} — ${b.product_name}`,
      detail: 'Finished batch',
      notes: b.notes?.trim() || undefined,
    })),
    ...queryAll<{
      id: number;
      occurred_at: string;
      volume_gal: number;
      batch_number: string;
      run_type: string;
      still_name: string;
      notes: string;
    }>(`
      SELECT id, run_date as occurred_at, stillage_volume_gal as volume_gal,
             batch_number, run_type, still_name, notes
      FROM distillation_runs
      WHERE stillage_holding_tank_equipment_id = ?
        AND status = 'complete'
        AND COALESCE(stillage_discarded, 0) = 0
        AND stillage_volume_gal > 0
    `, [tankId]).map((row) => ({
      kind: 'stillage' as const,
      id: row.id,
      distillationRunId: row.id,
      occurred_at: row.occurred_at,
      volume_gal: row.volume_gal,
      abv: 0,
      summary: `Stillage from ${row.batch_number} (${runTypeLabels[row.run_type] ?? row.run_type})`,
      detail: row.still_name || undefined,
      notes: row.notes?.trim() || undefined,
    })),
    ...queryAll<{
      id: number;
      occurred_at: string;
      volume_gal: number;
      abv: number;
      notes: string;
    }>(`
      SELECT id, recorded_at as occurred_at, measured_volume_gal as volume_gal,
             measured_abv as abv, notes
      FROM holding_tank_opening_balances
      WHERE tank_equipment_id = ?
    `, [tankId]).map((row) => ({
      kind: 'opening' as const,
      id: row.id,
      occurred_at: row.occurred_at,
      volume_gal: row.volume_gal,
      abv: row.abv,
      summary: row.volume_gal > 0 ? 'On hand' : 'On hand cleared',
      detail: row.notes?.trim() || 'Recorded when tracking started',
      notes: row.notes?.trim() || undefined,
    })),
  ];

  entries.sort((a, b) => compareStoredDatesDesc(a.occurred_at, b.occurred_at));
  return entries.slice(0, limit);
}

export function getHoldingTankTransfers(): HoldingTankTransferView[] {
  return queryAll(
    `SELECT t.*,
            src.name as source_tank_name,
            dest.name as dest_tank_name
     FROM holding_tank_transfers t
     JOIN floor_equipment src ON src.id = t.source_tank_equipment_id
     LEFT JOIN floor_equipment dest ON dest.id = t.dest_tank_equipment_id
     ORDER BY t.transfer_date DESC, t.id DESC`,
  );
}

export function getHoldingTanksWithContents(): (FloorEquipment & HoldingTankContents)[] {
  return getHoldingTanks().map((tank) => ({
    ...tank,
    ...getHoldingTankContents(tank.id),
  }));
}

export function saveHoldingTankTransfer(
  transfer: Omit<HoldingTankTransfer, 'id' | 'created_at' | 'spirit_type'> & {
    spirit_type?: HoldingTankTransfer['spirit_type'];
  },
): void {
  const discarding = transfer.dest_tank_equipment_id == null;
  if (!discarding && transfer.source_tank_equipment_id === transfer.dest_tank_equipment_id) {
    throw new Error('Source and destination tanks must be different.');
  }
  if (transfer.volume_gal <= 0) {
    throw new Error('Transfer volume must be greater than zero.');
  }
  assertEnteredAbv(transfer.abv, 'Transfer ABV');
  assertSpiritTransferVessel(transfer.source_tank_equipment_id, 'source');
  assertEquipmentUsableForProduction(transfer.source_tank_equipment_id, 'Source tank');
  if (!discarding && transfer.dest_tank_equipment_id != null) {
    assertSpiritTransferVessel(transfer.dest_tank_equipment_id, 'destination');
    assertEquipmentUsableForProduction(transfer.dest_tank_equipment_id, 'Destination tank');
    assertCollectionVesselCutTransfer(
      transfer.source_tank_equipment_id,
      transfer.dest_tank_equipment_id,
    );
  }
  assertStillageTransferDestination(
    transfer.source_tank_equipment_id,
    discarding ? null : transfer.dest_tank_equipment_id,
  );
  const available = getHoldingTankContents(transfer.source_tank_equipment_id);
  if (transfer.volume_gal > available.volume_gal + 0.01) {
    throw new Error(`Only ${available.volume_gal.toFixed(1)} gal available in the source tank.`);
  }
  insertRow(
    `INSERT INTO holding_tank_transfers
      (spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      transfer.spirit_type ?? 'low_wines',
      transfer.source_tank_equipment_id,
      transfer.dest_tank_equipment_id,
      transfer.volume_gal,
      transfer.abv,
      transfer.transfer_date,
      transfer.notes,
    ],
  );
  syncHoldingTankStatuses();
}

export function deleteHoldingTankTransfer(id: number): void {
  runQuery('DELETE FROM holding_tank_transfers WHERE id = ?', [id]);
  syncHoldingTankStatuses();
}

export interface FermenterWithWash extends Omit<FermenterWashSourceOption, 'status'> {
  capacity_gal: number;
  status: FloorEquipment['status'];
  latest_brix: number | null;
}

/** Fermenters that still hold fermenting or finished wash. */
export function getFermentersWithWash(): FermenterWithWash[] {
  const rows = queryAll<{
    id: number;
    mash_batch_id: number;
    floor_equipment_id: number;
    volume_gal: number;
    equipment_name: string;
    capacity_gal: number;
    status: FloorEquipment['status'];
    batch_number: string;
    recipe_name: string;
  }>(`
    SELECT a.id, a.mash_batch_id, a.floor_equipment_id, a.volume_gal,
           fe.name as equipment_name, fe.capacity_gal, fe.status,
           m.batch_number, m.recipe_name
    FROM mash_fermenter_assignments a
    JOIN mash_batches m ON m.id = a.mash_batch_id
    JOIN floor_equipment fe ON fe.id = a.floor_equipment_id
    WHERE a.volume_gal > 0.01
      AND COALESCE(a.status, 'fermenting') != 'discarded'
      AND m.status IN ('fermenting', 'complete')
      AND fe.equipment_type = 'fermenter'
    ORDER BY fe.name COLLATE NOCASE, m.batch_number COLLATE NOCASE
  `);
  return rows.map((row) => ({
    ...row,
    latest_brix: getLatestFermentationBrix(row.mash_batch_id, row.floor_equipment_id),
  }));
}

export interface FermenterTransferDestination {
  id: number;
  name: string;
  capacity_gal: number;
  volume_gal: number;
  batch_number: string | null;
}

/** Empty fermenters, or fermenters already holding this same wash. */
export function getFermenterTransferDestinations(
  sourceEquipmentId: number,
  mashBatchId: number,
): FermenterTransferDestination[] {
  const fermenters = queryAll<FloorEquipment>(
    `SELECT * FROM floor_equipment
     WHERE equipment_type = 'fermenter' AND id != ?
     ORDER BY name COLLATE NOCASE`,
    [sourceEquipmentId],
  );
  const destinations: FermenterTransferDestination[] = [];
  for (const fermenter of fermenters) {
    if (fermenter.status === 'offline') continue;
    if (equipmentNeedsCleaning(fermenter) || equipmentBlocksProduction(fermenter)) continue;
    const other = queryOne<{ id: number }>(
      `SELECT a.id FROM mash_fermenter_assignments a
       WHERE a.floor_equipment_id = ? AND a.mash_batch_id != ? AND a.volume_gal > 0.01
         AND COALESCE(a.status, 'fermenting') != 'discarded'
       LIMIT 1`,
      [fermenter.id, mashBatchId],
    );
    if (other) continue;
    const same = queryOne<{ volume_gal: number; batch_number: string }>(
      `SELECT a.volume_gal, m.batch_number
       FROM mash_fermenter_assignments a
       JOIN mash_batches m ON m.id = a.mash_batch_id
       WHERE a.floor_equipment_id = ? AND a.mash_batch_id = ?`,
      [fermenter.id, mashBatchId],
    );
    destinations.push({
      id: fermenter.id,
      name: fermenter.name,
      capacity_gal: fermenter.capacity_gal,
      volume_gal: same?.volume_gal ?? 0,
      batch_number: same?.batch_number ?? null,
    });
  }
  return destinations;
}

export function getDiscardedFermentations(): DiscardedFermentation[] {
  return queryAll(
    `SELECT * FROM discarded_fermentations
     ORDER BY discarded_date DESC, id DESC`,
  );
}

/** Move wash to another fermenter, or record unusable gallons as leftovers. */
export function saveFermenterWashTransfer(input: {
  sourceEquipmentId: number;
  destEquipmentId: number | null;
  discarded: boolean;
  volumeGal: number;
  transferDate: string;
  notes: string;
}): void {
  const sources = queryAll<{
    id: number;
    mash_batch_id: number;
    volume_gal: number;
    batch_number: string;
    fermenter_name: string;
  }>(`
    SELECT a.id, a.mash_batch_id, a.volume_gal, m.batch_number,
           fe.name as fermenter_name
    FROM mash_fermenter_assignments a
    JOIN mash_batches m ON m.id = a.mash_batch_id
    JOIN floor_equipment fe ON fe.id = a.floor_equipment_id
    WHERE a.floor_equipment_id = ?
      AND a.volume_gal > 0.01
      AND COALESCE(a.status, 'fermenting') != 'discarded'
      AND m.status IN ('fermenting', 'complete')
      AND fe.equipment_type = 'fermenter'
  `, [input.sourceEquipmentId]);
  if (sources.length === 0) {
    throw new Error('This fermenter has no wash to transfer.');
  }
  if (sources.length > 1) {
    throw new Error('This fermenter holds more than one wash.');
  }
  const source = sources[0];
  const discarded = input.discarded || input.destEquipmentId === DISCARD_DESTINATION;

  let dest: FloorEquipment | null = null;
  let destVolume = 0;
  let destHoldsOtherMash = false;
  if (!discarded && input.destEquipmentId) {
    dest = queryOne<FloorEquipment>(
      'SELECT * FROM floor_equipment WHERE id = ?',
      [input.destEquipmentId],
    );
    if (dest) {
      destHoldsOtherMash = !!queryOne<{ id: number }>(
        `SELECT id FROM mash_fermenter_assignments
         WHERE floor_equipment_id = ? AND mash_batch_id != ? AND volume_gal > 0.01
           AND COALESCE(status, 'fermenting') != 'discarded'
         LIMIT 1`,
        [dest.id, source.mash_batch_id],
      );
      destVolume = queryOne<{ volume_gal: number }>(
        `SELECT volume_gal FROM mash_fermenter_assignments
         WHERE floor_equipment_id = ? AND mash_batch_id = ?`,
        [dest.id, source.mash_batch_id],
      )?.volume_gal ?? 0;
    }
  }

  const error = fermenterTransferError({
    volumeGal: input.volumeGal,
    availableGal: source.volume_gal,
    discarded,
    destId: discarded ? null : input.destEquipmentId,
    sourceId: input.sourceEquipmentId,
    destType: dest?.equipment_type ?? null,
    destName: dest?.name,
    destHoldsOtherMash,
    destVolumeGal: destVolume,
    destCapacityGal: dest?.capacity_gal,
    destNeedsCleaning: dest ? equipmentNeedsCleaning(dest) : false,
    destBlocked: dest ? equipmentBlocksProduction(dest) : false,
    destOffline: dest?.status === 'offline',
  });
  if (error) throw new Error(error);
  if (!input.transferDate.trim()) {
    throw new Error('Enter the transfer date.');
  }

  const remaining = source.volume_gal - input.volumeGal;
  if (remaining <= 0.01) {
    releaseFermenterForMash(source.mash_batch_id, input.sourceEquipmentId);
  } else {
    runQuery(
      'UPDATE mash_fermenter_assignments SET volume_gal = ? WHERE id = ?',
      [remaining, source.id],
    );
  }

  if (discarded) {
    insertRow(
      `INSERT INTO discarded_fermentations
        (mash_batch_id, source_fermenter_equipment_id, batch_number, fermenter_name, volume_gal, discarded_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        source.mash_batch_id,
        input.sourceEquipmentId,
        source.batch_number,
        source.fermenter_name,
        input.volumeGal,
        input.transferDate,
        input.notes.trim() || 'Leftovers',
      ],
    );
    // Only these gallons are unusable. The fermentation is not discarded.
  } else if (dest) {
    const same = queryOne<{ id: number; volume_gal: number }>(
      `SELECT id, volume_gal FROM mash_fermenter_assignments
       WHERE mash_batch_id = ? AND floor_equipment_id = ?`,
      [source.mash_batch_id, dest.id],
    );
    if (same) {
      runQuery(
        `UPDATE mash_fermenter_assignments
         SET volume_gal = ?,
             status = CASE WHEN status = 'discarded' THEN 'fermenting' ELSE status END
         WHERE id = ?`,
        [same.volume_gal + input.volumeGal, same.id],
      );
    } else {
      insertRow(
        'INSERT INTO mash_fermenter_assignments (mash_batch_id, floor_equipment_id, volume_gal) VALUES (?, ?, ?)',
        [source.mash_batch_id, dest.id, input.volumeGal],
      );
    }
  }

  syncFermenterAndStillStatuses();
}

/** Put discarded gallons back when the fermenter is empty or still holds that wash. */
export function deleteDiscardedFermentation(id: number): void {
  const row = queryOne<DiscardedFermentation>(
    'SELECT * FROM discarded_fermentations WHERE id = ?',
    [id],
  );
  if (!row) return;

  const fermenter = queryOne<FloorEquipment>(
    'SELECT * FROM floor_equipment WHERE id = ?',
    [row.source_fermenter_equipment_id],
  );
  if (!fermenter) {
    throw new Error('That fermenter no longer exists.');
  }
  if (!row.mash_batch_id) {
    throw new Error('This discard record has no wash batch to restore.');
  }
  const mash = queryOne<{ id: number; status: string }>(
    'SELECT id, status FROM mash_batches WHERE id = ?',
    [row.mash_batch_id],
  );
  if (!mash) {
    throw new Error('The wash batch for this discard no longer exists.');
  }
  if (fermenter.status === 'offline') {
    throw new Error(`${fermenter.name} is offline and cannot receive the restored wash.`);
  }
  if (equipmentBlocksProduction(fermenter)) {
    throw new Error(`${fermenter.name} is out of service and cannot receive the restored wash.`);
  }
  const other = queryOne<{ id: number }>(
    `SELECT id FROM mash_fermenter_assignments
     WHERE floor_equipment_id = ? AND mash_batch_id != ? AND volume_gal > 0.01
     LIMIT 1`,
    [fermenter.id, mash.id],
  );
  if (other) {
    throw new Error(`${fermenter.name} now holds a different wash.`);
  }

  const same = queryOne<{ id: number; volume_gal: number }>(
    `SELECT id, volume_gal FROM mash_fermenter_assignments
     WHERE mash_batch_id = ? AND floor_equipment_id = ?`,
    [mash.id, fermenter.id],
  );
  const nextVolume = (same?.volume_gal ?? 0) + row.volume_gal;
  if (fermenter.capacity_gal > 0 && nextVolume > fermenter.capacity_gal + 0.01) {
    throw new Error(
      `${fermenter.name} does not have room to restore ${row.volume_gal.toFixed(1)} gal.`,
    );
  }

  if (mash.status === 'discarded') {
    runQuery(`UPDATE mash_batches SET status = 'fermenting' WHERE id = ?`, [mash.id]);
  }
  if (same) {
    runQuery(
      'UPDATE mash_fermenter_assignments SET volume_gal = ? WHERE id = ?',
      [nextVolume, same.id],
    );
  } else {
    insertRow(
      'INSERT INTO mash_fermenter_assignments (mash_batch_id, floor_equipment_id, volume_gal) VALUES (?, ?, ?)',
      [mash.id, fermenter.id, row.volume_gal],
    );
  }
  runQuery('DELETE FROM discarded_fermentations WHERE id = ?', [id]);
  syncFermenterAndStillStatuses();
}

/** Clear spirit from every holding tank (cuts, transfers, charges, blend draws). */
export function emptyAllHoldingTanks(): {
  transfersRemoved: number;
  cutsCleared: number;
  runsCleared: number;
  blendsCleared: number;
} {
  const transfersRemoved = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM holding_tank_transfers',
  )?.count ?? 0;
  runQuery('DELETE FROM holding_tank_transfers');

  const cutsCleared = queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM distillation_cuts
    WHERE holding_tank_equipment_id IS NOT NULL AND volume_gal > 0
  `)?.count ?? 0;
  runQuery(`
    UPDATE distillation_cuts
    SET volume_gal = 0, holding_tank_equipment_id = NULL
    WHERE holding_tank_equipment_id IS NOT NULL AND volume_gal > 0
  `);

  const runsCleared = queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM distillation_runs
    WHERE source_holding_tank_equipment_id IS NOT NULL AND charge_volume_gal > 0
  `)?.count ?? 0;
  runQuery(`
    UPDATE distillation_runs
    SET charge_volume_gal = 0, charge_abv = NULL,
        proof_spirit_gal = NULL, proof_spirit_abv = NULL,
        proof_water_gal = 0, proof_place = NULL
    WHERE source_holding_tank_equipment_id IS NOT NULL AND charge_volume_gal > 0
  `);
  runQuery(`
    UPDATE distillation_runs
    SET stillage_volume_gal = 0, stillage_holding_tank_equipment_id = NULL, stillage_discarded = 1
    WHERE stillage_holding_tank_equipment_id IS NOT NULL
      AND COALESCE(stillage_volume_gal, 0) > 0
  `);

  const blendsCleared = queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM blend_products
    WHERE source_holding_tank_equipment_id IS NOT NULL
      AND base_spirit_volume_gal > 0
      AND status IN ${BLEND_LEDGER_STATUSES_SQL}
  `)?.count ?? 0;
  runQuery(`
    UPDATE blend_products
    SET base_spirit_volume_gal = 0, base_spirit_abv = 0, status = 'draft', executed_at = NULL
    WHERE source_holding_tank_equipment_id IS NOT NULL
      AND base_spirit_volume_gal > 0
      AND status IN ${BLEND_LEDGER_STATUSES_SQL}
  `);
  runQuery(`DELETE FROM blend_spirit_sources`);

  syncHoldingTankStatuses();

  return { transfersRemoved, cutsCleared, runsCleared, blendsCleared };
}

export function syncHoldingTankStatuses(): void {
  const tanks = queryAll<FloorEquipment>(
    "SELECT * FROM floor_equipment WHERE equipment_type IN ('holding_tank', 'stillage_tank', 'collection_vessel')",
  );
  for (const tank of tanks) {
    const contents = getHoldingTankContents(tank.id);
    if (contents.volume_gal > 0) {
      runQuery(`UPDATE floor_equipment SET status='in_use' WHERE id=?`, [tank.id]);
    } else if (tank.status === 'in_use') {
      markEquipmentNeedsCleaningAfterUse(tank.id);
    }
  }
}

export function syncFermenterAndStillStatuses(): void {
  const fermenters = queryAll<FloorEquipment>(
    "SELECT * FROM floor_equipment WHERE equipment_type = 'fermenter'",
  );
  for (const f of fermenters) {
    const row = queryOne<{ mash_batch_id: number; status: string; volume_gal: number }>(`
      SELECT a.mash_batch_id, m.status, a.volume_gal
      FROM mash_fermenter_assignments a
      JOIN mash_batches m ON m.id = a.mash_batch_id
      WHERE a.floor_equipment_id = ?
        AND m.status IN ('fermenting', 'complete')
        AND COALESCE(a.status, 'fermenting') != 'discarded'
      LIMIT 1
    `, [f.id]);

    const shouldBeInUse = !!row
      && row.volume_gal > 0.01
      && fermenterShowsAssignedWash(row.status as MashStatus);

    if (shouldBeInUse) {
      runQuery(
        `UPDATE floor_equipment SET status='in_use', linked_mash_batch_id=? WHERE id=?`,
        [row.mash_batch_id, f.id],
      );
    } else if (f.status === 'in_use') {
      markEquipmentNeedsCleaningAfterUse(f.id);
    }
  }

  const stills = queryAll<FloorEquipment>(
    "SELECT * FROM floor_equipment WHERE equipment_type IN ('pot_still', 'column_still')",
  );
  for (const s of stills) {
    if (s.status === 'offline') continue;
    const runningRun = queryOne<{ id: number }>(
      "SELECT id FROM distillation_runs WHERE still_name = ? AND status = 'running' LIMIT 1",
      [s.name],
    );
    if (runningRun) {
      runQuery(`UPDATE floor_equipment SET status='in_use' WHERE id=?`, [s.id]);
    } else if (s.status === 'in_use') {
      const plannedRun = queryOne<{ id: number }>(
        "SELECT id FROM distillation_runs WHERE still_name = ? AND status = 'planned' LIMIT 1",
        [s.name],
      );
      if (plannedRun) {
        // A plan does not occupy the still. Release it without a cleaning hold.
        runQuery(`UPDATE floor_equipment SET status='empty' WHERE id=?`, [s.id]);
      } else {
        markEquipmentNeedsCleaningAfterUse(s.id);
      }
    }
  }
}

export function saveMashFermenterAssignments(
  mashBatchId: number,
  assignments: FermenterAssignmentInput[],
): void {
  const batchStatus = getMashBatch(mashBatchId)?.status;
  const planOnly = plannedRecordSkipsEquipmentStatus(batchStatus);
  if (planOnly) {
    const fermenters = queryAll<{ floor_equipment_id: number }>(
      'SELECT floor_equipment_id FROM mash_fermenter_assignments WHERE mash_batch_id = ?',
      [mashBatchId],
    );
    for (const fermenter of fermenters) {
      releaseEquipmentWithoutCleaningHold(fermenter.floor_equipment_id, false);
    }
  }
  runQuery('DELETE FROM mash_fermenter_assignments WHERE mash_batch_id = ?', [mashBatchId]);
  for (const a of assignments) {
    if (a.equipmentId <= 0) continue;
    const status = assignmentStatus(a.status);
    if (!planOnly && status !== 'discarded') assertEquipmentUsableForProduction(a.equipmentId, 'Fermenter');
    insertRow(
      `INSERT INTO mash_fermenter_assignments (mash_batch_id, floor_equipment_id, volume_gal, status) VALUES (?, ?, ?, ?)`,
      [mashBatchId, a.equipmentId, a.volumeGal, status],
    );
  }
  syncFermenterAndStillStatuses();
}

function getPrimaryWashTank(): FloorEquipment | undefined {
  const named = queryOne<FloorEquipment>(
    `SELECT * FROM floor_equipment WHERE equipment_type = 'mash_tun' AND name LIKE '%wash%' COLLATE NOCASE ORDER BY id LIMIT 1`,
  );
  return named ?? queryOne<FloorEquipment>(
    `SELECT * FROM floor_equipment WHERE equipment_type = 'mash_tun' ORDER BY id LIMIT 1`,
  ) ?? undefined;
}

function releaseWashTankForMashBatch(mashBatchId: number, returningToPlanned = false): void {
  const tanks = queryAll<{ id: number; status: string }>(
    `SELECT id, status FROM floor_equipment
     WHERE equipment_type='mash_tun' AND linked_mash_batch_id=?`,
    [mashBatchId],
  );
  for (const tank of tanks) {
    if (returningToPlanned) {
      releaseEquipmentWithoutCleaningHold(tank.id, false);
      runQuery(
        `UPDATE floor_equipment SET linked_mash_batch_id=NULL WHERE id=? AND linked_mash_batch_id=?`,
        [tank.id, mashBatchId],
      );
      continue;
    }
    if (tank.status === 'in_use') {
      markEquipmentNeedsCleaningAfterUse(tank.id);
    } else {
      runQuery(
        `UPDATE floor_equipment SET linked_mash_batch_id=NULL WHERE id=?`,
        [tank.id],
      );
    }
  }
}

function syncWashTankForMashBatch(mashBatchId: number, status: MashStatus): void {
  releaseWashTankForMashBatch(mashBatchId, plannedRecordSkipsEquipmentStatus(status));
  if (status !== 'mashing') return;
  const tun = getPrimaryWashTank();
  if (!tun) return;
  assertEquipmentUsableForProduction(tun.id, 'Wash tank');
  runQuery(
    `UPDATE floor_equipment SET status='in_use', linked_mash_batch_id=? WHERE id=?`,
    [mashBatchId, tun.id],
  );
}

/** Fail fast before writing mash_batches when equipment is out of service. */
function assertMashBatchEquipmentUsable(
  batch: Pick<MashBatch, 'status'>,
  assignments: FermenterAssignmentInput[],
): void {
  if (plannedRecordSkipsEquipmentStatus(batch.status)) return;
  for (const a of assignments) {
    if (a.equipmentId <= 0) continue;
    if (assignmentStatus(a.status) === 'discarded') continue;
    assertEquipmentUsableForProduction(a.equipmentId, 'Fermenter');
  }
  if (batch.status === 'mashing') {
    const tun = getPrimaryWashTank();
    if (tun) assertEquipmentUsableForProduction(tun.id, 'Wash tank');
  }
}

/** Primary wash tank (mash tun) for UI previews and capacity hints. */
export function getPrimaryWashTankEquipment(): FloorEquipment | undefined {
  return getPrimaryWashTank() ?? undefined;
}

export function saveMashBatchWithFermenters(
  batch: Omit<MashBatch, 'id' | 'created_at'>,
  assignments: FermenterAssignmentInput[],
  nutrients: MashBatchNutrientInput[] = [],
  id?: number,
  options?: { replaceAssignments?: boolean },
): number {
  const previous = id ? getMashBatch(id) : undefined;
  const previousNutrients = id
    ? getMashBatchNutrients(id).map((n) => ({ name: n.name, amount: n.amount, unit: n.unit }))
    : [];
  const datedBatch = {
    ...batch,
    start_date: eventDateWhenLeavingPlanned(previous?.status, batch.status, batch.start_date),
  };
  assertMashBatchCompleteHasLogs(datedBatch, id);
  assertMashBatchEquipmentUsable(datedBatch, assignments);
  const mashId = saveMashBatch(datedBatch, id);
  let assignmentsToPersist = assignments;
  if (!options?.replaceAssignments && assignmentsToPersist.length === 0 && batch.status === 'complete' && id) {
    assignmentsToPersist = getMashFermenterAssignments(id).map((a) => ({
      equipmentId: a.floor_equipment_id,
      volumeGal: a.volume_gal,
      status: assignmentStatus(a.status),
    }));
  }
  try {
    saveMashFermenterAssignments(mashId, assignmentsToPersist);
    persistMashBatchNutrients(mashId, nutrients);
    applyMashInventoryUsage(datedBatch, previous, previousNutrients, nutrients);
    syncWashTankForMashBatch(mashId, datedBatch.status);
  } catch (err) {
    if (!id) {
      runQuery('DELETE FROM mash_batches WHERE id = ?', [mashId]);
    }
    throw err;
  }
  return mashId;
}

export function fermenterHasFermentationLogs(mashBatchId: number, floorEquipmentId: number): boolean {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM fermentation_logs
     WHERE mash_batch_id = ? AND floor_equipment_id = ?`,
    [mashBatchId, floorEquipmentId],
  );
  return (row?.count ?? 0) > 0;
}

/** Save one wash's fermenter rows. Mash status follows those fermenters. */
export function saveFermentationSet(
  mashBatchId: number,
  assignments: FermenterAssignmentInput[],
  moveLogs?: { fromEquipmentId: number; toEquipmentId: number },
  options?: { keepStatusWhenEmpty?: boolean; actualStartBrix?: number },
): void {
  const batch = getMashBatch(mashBatchId);
  if (!batch) throw new Error('Wash batch not found.');

  for (const assignment of assignments) {
    if (assignmentStatus(assignment.status) !== 'complete') continue;
    const logEquipmentId = moveLogs && moveLogs.toEquipmentId === assignment.equipmentId
      ? moveLogs.fromEquipmentId
      : assignment.equipmentId;
    if (!fermenterHasFermentationLogs(mashBatchId, logEquipmentId)) {
      throw new Error('Add at least one fermentation log on this fermenter before marking it complete.');
    }
  }

  if (moveLogs && moveLogs.fromEquipmentId !== moveLogs.toEquipmentId) {
    const conflict = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM fermentation_logs
       WHERE mash_batch_id = ? AND floor_equipment_id = ?`,
      [mashBatchId, moveLogs.toEquipmentId],
    );
    if ((conflict?.count ?? 0) > 0) {
      throw new Error('That fermenter already has logs for this wash.');
    }
  }

  const nextStatus = mashStatusFromFermentations(
    batch.status,
    assignments.map((assignment) => assignmentStatus(assignment.status)),
  );

  if (assignments.length === 0 && options?.keepStatusWhenEmpty) {
    const status = batch.status === 'discarded' ? 'fermenting' : batch.status;
    if (status !== batch.status) {
      runQuery(`UPDATE mash_batches SET status = ? WHERE id = ?`, [status, mashBatchId]);
    }
    saveMashFermenterAssignments(mashBatchId, []);
    return;
  }

  if (nextStatus === 'mashing' && assignments.length === 0) {
    runQuery(`UPDATE mash_batches SET status = 'mashing' WHERE id = ?`, [mashBatchId]);
    saveMashFermenterAssignments(mashBatchId, []);
    return;
  }

  const nutrients = getMashBatchNutrients(mashBatchId).map((nutrient) => ({
    name: nutrient.name,
    amount: nutrient.amount,
    unit: nutrient.unit,
  }));
  const { id: _id, created_at: _created, ...batchFields } = batch;
  const actualStartBrix = options?.actualStartBrix;
  saveMashBatchWithFermenters(
    {
      ...batchFields,
      status: nextStatus,
      ...(actualStartBrix != null && Number.isFinite(actualStartBrix) ? { actual_brix: actualStartBrix } : {}),
    },
    assignments,
    nutrients,
    mashBatchId,
    { replaceAssignments: true },
  );

  if (moveLogs && moveLogs.fromEquipmentId !== moveLogs.toEquipmentId) {
    runQuery(
      `UPDATE fermentation_logs SET floor_equipment_id = ?
       WHERE mash_batch_id = ? AND floor_equipment_id = ?`,
      [moveLogs.toEquipmentId, mashBatchId, moveLogs.fromEquipmentId],
    );
  }
}

/** Record gallons from one fermenter that cannot be used. The fermentation itself stays. */
export function recordFermenterLeftover(input: {
  mashBatchId: number;
  equipmentId: number;
  fermenterName: string;
  volumeGal: number;
  notes: string;
}): void {
  const batch = getMashBatch(input.mashBatchId);
  if (!batch) throw new Error('Wash batch not found.');
  if (!(input.volumeGal > 0)) return;
  insertRow(
    `INSERT INTO discarded_fermentations
      (mash_batch_id, source_fermenter_equipment_id, batch_number, fermenter_name, volume_gal, discarded_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.mashBatchId,
      input.equipmentId,
      batch.batch_number,
      input.fermenterName,
      input.volumeGal,
      localIsoDate(),
      input.notes.trim() || 'Leftovers',
    ],
  );
}

/** Remove one fermenter. Sibling fermenters and the wash batch stay. */
export function deleteOneFermentation(mashBatchId: number, equipmentId: number | null): void {
  if (equipmentId == null) {
    deleteMashBatch(mashBatchId);
    return;
  }
  const assignments = getMashFermenterAssignments(mashBatchId);
  const remaining = assignments.filter((assignment) => assignment.floor_equipment_id !== equipmentId);
  runQuery(
    'DELETE FROM fermentation_logs WHERE mash_batch_id = ? AND floor_equipment_id = ?',
    [mashBatchId, equipmentId],
  );
  if (remaining.length === assignments.length) return;
  saveFermentationSet(
    mashBatchId,
    remaining.map((assignment) => ({
      equipmentId: assignment.floor_equipment_id,
      volumeGal: assignment.volume_gal,
      status: assignmentStatus(assignment.status),
    })),
  );
}

export function releaseFermentersForMash(mashBatchId: number): void {
  runQuery('DELETE FROM mash_fermenter_assignments WHERE mash_batch_id = ?', [mashBatchId]);
  syncFermenterAndStillStatuses();
}

export function releaseFermenterForMash(mashBatchId: number, equipmentId: number): void {
  runQuery(
    'DELETE FROM mash_fermenter_assignments WHERE mash_batch_id = ? AND floor_equipment_id = ?',
    [mashBatchId, equipmentId],
  );
  markEquipmentNeedsCleaningAfterUse(equipmentId);
  syncFermenterAndStillStatuses();
}

function chargeHeavyRumFromFermenter(
  mashBatchId: number,
  equipmentId: number,
  chargeVolumeGal: number,
  runId?: number,
): void {
  if (!(chargeVolumeGal > 0)) {
    throw new Error('Charge volume must be greater than zero for heavy rum runs.');
  }

  const assignment = queryOne<{ id: number; volume_gal: number }>(
    'SELECT id, volume_gal FROM mash_fermenter_assignments WHERE mash_batch_id = ? AND floor_equipment_id = ?',
    [mashBatchId, equipmentId],
  );
  if (!assignment) {
    throw new Error('Fermenter assignment not found for this wash batch.');
  }

  let previousCharge = 0;
  if (runId) {
    const prev = queryOne<{ charge_volume_gal: number; run_type: string }>(
      'SELECT charge_volume_gal, run_type FROM distillation_runs WHERE id = ?',
      [runId],
    );
    if (prev?.run_type === 'heavy_rum') {
      previousCharge = prev.charge_volume_gal ?? 0;
    }
  }

  const delta = chargeVolumeGal - previousCharge;
  if (Math.abs(delta) < 0.001) return;

  const maxAvailable = assignment.volume_gal + previousCharge;
  if (chargeVolumeGal > maxAvailable + 0.01) {
    throw new Error(
      `Only ${maxAvailable.toFixed(1)} gal available in fermenter; charge is ${chargeVolumeGal.toFixed(1)} gal.`,
    );
  }

  const remaining = assignment.volume_gal - delta;
  if (remaining <= 0.01) {
    releaseFermenterForMash(mashBatchId, equipmentId);
  } else {
    runQuery(
      'UPDATE mash_fermenter_assignments SET volume_gal = ? WHERE id = ?',
      [remaining, assignment.id],
    );
    syncFermenterAndStillStatuses();
  }
}

function restoreHeavyRumChargeToFermenter(
  mashBatchId: number,
  equipmentId: number,
  volumeGal: number,
): void {
  if (!(volumeGal > 0)) return;
  const assignment = queryOne<{ id: number; volume_gal: number }>(
    'SELECT id, volume_gal FROM mash_fermenter_assignments WHERE mash_batch_id = ? AND floor_equipment_id = ?',
    [mashBatchId, equipmentId],
  );
  if (assignment) {
    runQuery(
      'UPDATE mash_fermenter_assignments SET volume_gal = ? WHERE id = ?',
      [assignment.volume_gal + volumeGal, assignment.id],
    );
  } else {
    insertRow(
      'INSERT INTO mash_fermenter_assignments (mash_batch_id, floor_equipment_id, volume_gal) VALUES (?, ?, ?)',
      [mashBatchId, equipmentId, volumeGal],
    );
  }
  syncFermenterAndStillStatuses();
}

function distillationRunActivelyChargesFermenter(status: string): boolean {
  return status === 'running' || status === 'complete';
}

function revertFermenterChargeFromRun(run: DistillationRun): void {
  if (!run.source_mash_batch_id || !run.source_fermenter_equipment_id) return;
  const runType = (run.run_type ?? 'wash') as DistillationRunType;
  if (!isFermenterSourcedRun(runType) || !(run.charge_volume_gal > 0)) return;
  restoreHeavyRumChargeToFermenter(
    run.source_mash_batch_id,
    run.source_fermenter_equipment_id,
    run.charge_volume_gal,
  );
}

/** Deduct fermenter wash only when a low wine or heavy rum run is running or complete. */
function applyFermenterChargeChanges(
  run: Omit<DistillationRun, 'id' | 'created_at'>,
  runType: DistillationRunType,
  runId: number | undefined,
  previous: DistillationRun | null | undefined,
): void {
  if (!isFermenterSourcedRun(runType)) return;

  const prev = previous ?? null;
  const wasCharging = prev != null
    && distillationRunActivelyChargesFermenter(prev.status)
    && prev.source_mash_batch_id
    && prev.source_fermenter_equipment_id;

  const nowCharging = distillationRunActivelyChargesFermenter(run.status)
    && run.source_mash_batch_id
    && run.source_fermenter_equipment_id;

  if (wasCharging && !nowCharging && prev) {
    revertFermenterChargeFromRun(prev);
  }

  if (!nowCharging || !run.source_mash_batch_id || !run.source_fermenter_equipment_id) return;

  if (runType === 'heavy_rum') {
    chargeHeavyRumFromFermenter(
      run.source_mash_batch_id,
      run.source_fermenter_equipment_id,
      run.charge_volume_gal,
      runId,
    );
    maybeCompleteMashAfterCharge(run.source_mash_batch_id);
    return;
  }

  if (runType === 'wash' && !wasCharging) {
    releaseFermenterForMash(run.source_mash_batch_id, run.source_fermenter_equipment_id);
    maybeCompleteMashAfterCharge(run.source_mash_batch_id);
  }
}

function maybeCompleteMashAfterCharge(mashBatchId: number): void {
  const remaining = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM mash_fermenter_assignments WHERE mash_batch_id = ?',
    [mashBatchId],
  );
  if (remaining?.count === 0) {
    runQuery(
      `UPDATE mash_batches SET status='complete' WHERE id=? AND status IN ('fermenting', 'mashing')`,
      [mashBatchId],
    );
  }
}

export function deleteMashBatch(id: number): void {
  releaseWashTankForMashBatch(id);
  releaseFermentersForMash(id);
  runQuery('DELETE FROM mash_batches WHERE id = ?', [id]);
}

export function getAllFermentationLogs(): FermentationLog[] {
  return queryAll<FermentationLog>(
    'SELECT * FROM fermentation_logs ORDER BY logged_at ASC',
  );
}

export interface FermentationLogSource {
  mash_batch_id: number;
  floor_equipment_id: number | null;
  equipment_name: string;
}

/** Fermenters whose wash was charged to a still. Leftover gallons are not a charge. */
export function getChargedFermenterPairs(): { mash_batch_id: number; floor_equipment_id: number }[] {
  return queryAll(
    `SELECT DISTINCT source_mash_batch_id as mash_batch_id,
            source_fermenter_equipment_id as floor_equipment_id
     FROM distillation_runs
     WHERE source_mash_batch_id IS NOT NULL
       AND source_fermenter_equipment_id IS NOT NULL
       AND status IN ('running', 'complete')
       AND charge_volume_gal > 0`,
  );
}

/** One row per fermenter that has logs, including fermenters released after a still charge. */
export function getAllFermentationLogSources(): FermentationLogSource[] {
  return queryAll<FermentationLogSource>(
    `SELECT fl.mash_batch_id,
            fl.floor_equipment_id,
            COALESCE(fe.name, '') as equipment_name
     FROM fermentation_logs fl
     LEFT JOIN floor_equipment fe ON fe.id = fl.floor_equipment_id
     GROUP BY fl.mash_batch_id, fl.floor_equipment_id
     ORDER BY fl.mash_batch_id, MIN(fl.logged_at)`,
  );
}

export function mashBatchHasFermentationLogs(mashBatchId: number): boolean {
  const row = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM fermentation_logs WHERE mash_batch_id = ?',
    [mashBatchId],
  );
  return (row?.count ?? 0) > 0;
}

function assertMashBatchCompleteHasLogs(
  batch: Omit<MashBatch, 'id' | 'created_at'>,
  id?: number,
): void {
  if (batch.status !== 'complete') return;
  if (!id) {
    throw new Error('Keep the batch fermenting, add fermentation logs, then mark it complete.');
  }
  if (!mashBatchHasFermentationLogs(id)) {
    throw new Error('Add at least one fermentation log before marking this wash batch complete.');
  }
}

export function distillationRunHasRecordedCuts(runId: number): boolean {
  const row = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM distillation_cuts WHERE distillation_run_id = ? AND volume_gal > 0',
    [runId],
  );
  return (row?.count ?? 0) > 0;
}

function assertStillageFitsTank(tankId: number, volumeGal: number, runId?: number): void {
  const tank = queryOne<{ name: string; capacity_gal: number; equipment_type: string }>(
    'SELECT name, capacity_gal, equipment_type FROM floor_equipment WHERE id = ?',
    [tankId],
  );
  if (!tank) throw new Error('Stillage tank not found.');
  const alreadyStoredHere = Boolean(
    runId
    && queryOne<{ id: number }>(`
      SELECT id FROM distillation_runs
      WHERE id = ?
        AND status = 'complete'
        AND stillage_holding_tank_equipment_id = ?
        AND COALESCE(stillage_discarded, 0) = 0
    `, [runId, tankId]),
  );
  if (!isStillageTankType(tank.equipment_type) && !alreadyStoredHere) {
    throw new Error(distillationStillageTankError(tank.name));
  }
  if (!(tank.capacity_gal > 0)) return;
  const contents = getHoldingTankContents(tankId);
  let already = 0;
  if (runId) {
    const prev = queryOne<{
      stillage_volume_gal: number | null;
      stillage_holding_tank_equipment_id: number | null;
      status: string;
      stillage_discarded: number | null;
    }>(
      `SELECT stillage_volume_gal, stillage_holding_tank_equipment_id, status, stillage_discarded
       FROM distillation_runs WHERE id = ?`,
      [runId],
    );
    if (
      prev
      && prev.status === 'complete'
      && prev.stillage_holding_tank_equipment_id === tankId
      && !prev.stillage_discarded
    ) {
      already = prev.stillage_volume_gal ?? 0;
    }
  }
  const occupied = Math.max(0, contents.volume_gal - already);
  if (occupied + volumeGal > tank.capacity_gal + 0.01) {
    throw new Error(
      `Stillage (${volumeGal} gal) does not fit in ${tank.name} (${tank.capacity_gal} gal capacity, ${occupied.toFixed(1)} gal already there).`,
    );
  }
}

function assertDistillationRunCompleteHasCuts(runId: number | undefined, status: string): void {
  if (status !== 'complete') return;
  if (!runId) {
    throw new Error('Save the run, record at least one cut with volume, then mark it complete.');
  }
  if (!distillationRunHasRecordedCuts(runId)) {
    throw new Error('Record at least one cut with volume before marking this distillation run complete.');
  }
}

export function getFermentationLogs(
  mashBatchId: number,
  floorEquipmentId?: number | null,
): FermentationLogView[] {
  if (floorEquipmentId === undefined) {
    return queryAll(
      `SELECT fl.*, fe.name as equipment_name
       FROM fermentation_logs fl
       LEFT JOIN floor_equipment fe ON fe.id = fl.floor_equipment_id
       WHERE fl.mash_batch_id = ?
       ORDER BY fl.logged_at DESC`,
      [mashBatchId],
    );
  }
  return queryAll(
    `SELECT fl.*, fe.name as equipment_name
     FROM fermentation_logs fl
     LEFT JOIN floor_equipment fe ON fe.id = fl.floor_equipment_id
     WHERE fl.mash_batch_id = ?
       AND (fl.floor_equipment_id = ? OR (? IS NULL AND fl.floor_equipment_id IS NULL))
     ORDER BY fl.logged_at DESC`,
    [mashBatchId, floorEquipmentId, floorEquipmentId],
  );
}

export function addFermentationLog(log: Omit<FermentationLog, 'id'>): void {
  const batch = getMashBatch(log.mash_batch_id);
  if (!batch) throw new Error('Wash batch not found.');
  if (log.floor_equipment_id) {
    const assignment = queryOne<{ status: string }>(
      `SELECT status FROM mash_fermenter_assignments
       WHERE mash_batch_id = ? AND floor_equipment_id = ?`,
      [log.mash_batch_id, log.floor_equipment_id],
    );
    const open = assignment
      ? assignmentStatus(assignment.status) === 'fermenting'
      : batch.status === 'fermenting';
    if (!open) {
      throw new Error('Fermentation logs can only be added while this fermentation is fermenting.');
    }
  } else if (batch.status !== 'fermenting') {
    throw new Error('Fermentation logs can only be added while this fermentation is fermenting.');
  }
  if (log.temperature_f == null || Number.isNaN(log.temperature_f)) {
    throw new Error('Temperature (°F) is required for fermentation logs.');
  }
  if (log.brix == null || Number.isNaN(log.brix)) {
    throw new Error('Brix is required for fermentation logs.');
  }
  insertRow(
    `INSERT INTO fermentation_logs (mash_batch_id, floor_equipment_id, logged_at, temperature_f, brix, ph, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      log.mash_batch_id,
      log.floor_equipment_id,
      log.logged_at,
      log.temperature_f,
      log.brix,
      log.ph,
      log.notes,
    ],
  );
  syncMashFinalBrixFromLogs(log.mash_batch_id);
}

export function getLatestFermentationBrix(mashBatchId: number, floorEquipmentId?: number | null): number | null {
  const row = floorEquipmentId
    ? queryOne<{ brix: number }>(
        `SELECT brix FROM fermentation_logs
         WHERE mash_batch_id = ? AND floor_equipment_id = ? AND brix IS NOT NULL
         ORDER BY logged_at DESC LIMIT 1`,
        [mashBatchId, floorEquipmentId],
      )
    : queryOne<{ brix: number }>(
        `SELECT brix FROM fermentation_logs
         WHERE mash_batch_id = ? AND brix IS NOT NULL
         ORDER BY logged_at DESC LIMIT 1`,
        [mashBatchId],
      );
  return row?.brix ?? null;
}

function syncMashFinalBrixFromLogs(mashBatchId: number): void {
  const latest = getLatestFermentationBrix(mashBatchId);
  if (latest == null) return;
  runQuery('UPDATE mash_batches SET actual_final_brix = ? WHERE id = ?', [latest, mashBatchId]);
}

// ── Distillation ───────────────────────────────────────────

export function getDistillationRuns(): DistillationRunView[] {
  return queryAll(
    `SELECT r.*,
       src.name as source_holding_tank_name,
       dest.name as dest_holding_tank_name,
       stillage_tank.name as stillage_tank_name
     FROM distillation_runs r
     LEFT JOIN floor_equipment src ON src.id = r.source_holding_tank_equipment_id
     LEFT JOIN floor_equipment dest ON dest.id = r.dest_holding_tank_equipment_id
     LEFT JOIN floor_equipment stillage_tank ON stillage_tank.id = r.stillage_holding_tank_equipment_id
     ORDER BY r.run_date DESC`,
  );
}

function stillEquipmentByName(stillName: string): FloorEquipment | undefined {
  const trimmed = stillName.trim();
  if (!trimmed) return undefined;
  return queryOne<FloorEquipment>(
    `SELECT * FROM floor_equipment
     WHERE name = ? AND equipment_type IN ('pot_still', 'column_still')`,
    [trimmed],
  ) ?? undefined;
}

/** When a running charge leaves a still, that still needs cleaning. A planned run does not. */
function releaseStillAfterRunningRun(
  previous: DistillationRun | null | undefined,
  nextStillName: string,
  nextStatus: string,
): void {
  if (!previous || !stillRunOccupiesEquipment(previous.status)) return;
  const leftThisStill = previous.still_name !== nextStillName || !stillRunOccupiesEquipment(nextStatus);
  if (!leftThisStill) return;
  const still = stillEquipmentByName(previous.still_name);
  if (!still) return;
  if (plannedRecordSkipsEquipmentStatus(nextStatus)) {
    releaseEquipmentWithoutCleaningHold(still.id, false);
    return;
  }
  if (still.status === 'in_use') {
    markEquipmentNeedsCleaningAfterUse(still.id);
  }
}

function tankHasLiquid(equipmentId: number): boolean {
  return getHoldingTankContents(equipmentId).volume_gal > 0.01;
}

/** Equipment touched by a run that is planned again is not left needing cleaning. */
function releaseDistillationEquipmentForReturnToPlan(run: DistillationRun, runId?: number): void {
  const still = stillEquipmentByName(run.still_name);
  if (still) releaseEquipmentWithoutCleaningHold(still.id, false);
  if (run.source_fermenter_equipment_id) {
    const stillHoldingWash = queryOne<{ volume_gal: number }>(
      `SELECT a.volume_gal
       FROM mash_fermenter_assignments a
       JOIN mash_batches m ON m.id = a.mash_batch_id
       WHERE a.floor_equipment_id = ?
         AND m.status IN ('fermenting', 'complete')
         AND COALESCE(a.status, 'fermenting') != 'discarded'
         AND a.volume_gal > 0.01
       LIMIT 1`,
      [run.source_fermenter_equipment_id],
    );
    releaseEquipmentWithoutCleaningHold(
      run.source_fermenter_equipment_id,
      (stillHoldingWash?.volume_gal ?? 0) > 0.01,
    );
  }
  const tankIds = new Set<number>();
  if (run.source_holding_tank_equipment_id) tankIds.add(run.source_holding_tank_equipment_id);
  if (run.dest_holding_tank_equipment_id) tankIds.add(run.dest_holding_tank_equipment_id);
  if (runId) {
    const cuts = queryAll<{ holding_tank_equipment_id: number | null }>(
      'SELECT holding_tank_equipment_id FROM distillation_cuts WHERE distillation_run_id = ?',
      [runId],
    );
    for (const cut of cuts) {
      if (cut.holding_tank_equipment_id) tankIds.add(cut.holding_tank_equipment_id);
    }
  }
  for (const tankId of tankIds) {
    releaseEquipmentWithoutCleaningHold(tankId, tankHasLiquid(tankId));
  }
}

export function saveDistillationRun(
  run: Omit<DistillationRun, 'id' | 'created_at'>,
  id?: number,
  botanicals?: GinBotanicalInput[],
): number {
  assertEnteredAbv(run.charge_abv, 'Charge ABV');
  assertEnteredAbv(run.proof_spirit_abv, 'Tails ABV');
  const runType = (run.run_type ?? 'wash') as DistillationRunType;
  const planOnly = plannedRecordSkipsEquipmentStatus(run.status);
  const previousRun = id
    ? queryOne<DistillationRun>('SELECT * FROM distillation_runs WHERE id = ?', [id])
    : null;
  if (!planOnly) {
    assertStillUsableByName(run.still_name);
    if (
      isFermenterSourcedRun(runType)
      && run.source_fermenter_equipment_id
      && !fermenterChargeSkipsCleaningGate(
        previousRun?.status,
        previousRun?.source_fermenter_equipment_id,
        run.source_fermenter_equipment_id,
      )
    ) {
      assertEquipmentUsableForProduction(run.source_fermenter_equipment_id, 'Fermenter');
    }
    if (isTankSourcedRun(runType) && run.source_holding_tank_equipment_id) {
      assertEquipmentUsableForProduction(run.source_holding_tank_equipment_id, 'Source tank');
    }
  }
  const stillCapacity = getStillCapacityByName(run.still_name);
  if (chargeExceedsStillCapacity(run.charge_volume_gal, stillCapacity)) {
    throw new Error(
      stillChargeCapacityMessage(run.charge_volume_gal, run.still_name, stillCapacity!),
    );
  }
  if (run.still_name.trim() && stillRunOccupiesEquipment(run.status)) {
    assertStillAvailableForCharge(run.still_name, id);
  }
  assertDistillationRunCompleteHasCuts(id, run.status);
  const stillageError = stillageSaveError({
    status: run.status,
    runType,
    volumeGal: run.stillage_volume_gal,
    discarded: Boolean(run.stillage_discarded),
    tankId: run.stillage_holding_tank_equipment_id,
  });
  if (stillageError) throw new Error(stillageError);
  const stillage = persistedStillage({
    status: run.status,
    runType,
    volumeGal: run.stillage_volume_gal,
    discarded: Boolean(run.stillage_discarded),
    tankId: run.stillage_holding_tank_equipment_id,
  });
  if (stillage.tankId && stillage.volumeGal && stillage.volumeGal > 0) {
    assertStillageFitsTank(stillage.tankId, stillage.volumeGal, id);
  }
  const runDate = eventDateWhenLeavingPlanned(previousRun?.status, run.status, run.run_date);
  let runId = id ?? 0;
  if (id) {
    runQuery(
      `UPDATE distillation_runs SET batch_number=?, run_type=?, source_mash_batch_id=?, source_fermenter_equipment_id=?, source_holding_tank_equipment_id=?, dest_holding_tank_equipment_id=?, still_name=?, run_date=?, charge_volume_gal=?, charge_abv=?, proof_spirit_gal=?, proof_spirit_abv=?, proof_water_gal=?, proof_place=?, stillage_volume_gal=?, stillage_discarded=?, stillage_holding_tank_equipment_id=?, status=?, assigned_user_id=?, assigned_user_name=?, notes=? WHERE id=?`,
      [
        run.batch_number,
        runType,
        isFermenterSourcedRun(runType) ? run.source_mash_batch_id : null,
        isFermenterSourcedRun(runType) ? run.source_fermenter_equipment_id : null,
        isTankSourcedRun(runType) ? run.source_holding_tank_equipment_id : null,
        null,
        run.still_name,
        runDate,
        run.charge_volume_gal,
        isTankSourcedRun(runType) ? run.charge_abv : null,
        isTankSourcedRun(runType) ? run.proof_spirit_gal ?? null : null,
        isTankSourcedRun(runType) ? run.proof_spirit_abv ?? null : null,
        isTankSourcedRun(runType) ? run.proof_water_gal ?? 0 : 0,
        isTankSourcedRun(runType) ? run.proof_place ?? null : null,
        stillage.volumeGal,
        stillage.discarded,
        stillage.tankId,
        run.status,
        run.assigned_user_id,
        run.assigned_user_name ?? '',
        run.notes,
        id,
      ],
    );
  } else {
    runId = insertRow(
      `INSERT INTO distillation_runs (batch_number, run_type, source_mash_batch_id, source_fermenter_equipment_id, source_holding_tank_equipment_id, dest_holding_tank_equipment_id, still_name, run_date, charge_volume_gal, charge_abv, proof_spirit_gal, proof_spirit_abv, proof_water_gal, proof_place, stillage_volume_gal, stillage_discarded, stillage_holding_tank_equipment_id, status, assigned_user_id, assigned_user_name, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.batch_number,
        runType,
        isFermenterSourcedRun(runType) ? run.source_mash_batch_id : null,
        isFermenterSourcedRun(runType) ? run.source_fermenter_equipment_id : null,
        isTankSourcedRun(runType) ? run.source_holding_tank_equipment_id : null,
        null,
        run.still_name,
        runDate,
        run.charge_volume_gal,
        isTankSourcedRun(runType) ? run.charge_abv : null,
        isTankSourcedRun(runType) ? run.proof_spirit_gal ?? null : null,
        isTankSourcedRun(runType) ? run.proof_spirit_abv ?? null : null,
        isTankSourcedRun(runType) ? run.proof_water_gal ?? 0 : 0,
        isTankSourcedRun(runType) ? run.proof_place ?? null : null,
        stillage.volumeGal,
        stillage.discarded,
        stillage.tankId,
        run.status,
        run.assigned_user_id,
        run.assigned_user_name ?? '',
        run.notes,
      ],
    );
  }

  applyFermenterChargeChanges(run, runType, id, previousRun);
  if (
    id
    && previousRun
    && planOnly
    && !plannedRecordSkipsEquipmentStatus(previousRun.status)
  ) {
    releaseDistillationEquipmentForReturnToPlan({
      ...previousRun,
      still_name: previousRun.still_name || run.still_name,
      source_fermenter_equipment_id: previousRun.source_fermenter_equipment_id ?? run.source_fermenter_equipment_id,
      source_holding_tank_equipment_id: previousRun.source_holding_tank_equipment_id ?? run.source_holding_tank_equipment_id,
      dest_holding_tank_equipment_id: previousRun.dest_holding_tank_equipment_id ?? run.dest_holding_tank_equipment_id,
    }, id);
    if (run.still_name.trim() && run.still_name !== previousRun.still_name) {
      const movedStill = stillEquipmentByName(run.still_name);
      if (movedStill) releaseEquipmentWithoutCleaningHold(movedStill.id, false);
    }
    if (run.source_holding_tank_equipment_id && run.source_holding_tank_equipment_id !== previousRun.source_holding_tank_equipment_id) {
      releaseEquipmentWithoutCleaningHold(run.source_holding_tank_equipment_id, tankHasLiquid(run.source_holding_tank_equipment_id));
    }
    if (run.dest_holding_tank_equipment_id && run.dest_holding_tank_equipment_id !== previousRun.dest_holding_tank_equipment_id) {
      releaseEquipmentWithoutCleaningHold(run.dest_holding_tank_equipment_id, tankHasLiquid(run.dest_holding_tank_equipment_id));
    }
  }
  releaseStillAfterRunningRun(previousRun, run.still_name, run.status);

  if (runType === 'gin' && botanicals) {
    persistRunBotanicals(runId, botanicals);
  }
  syncHoldingTankStatuses();
  syncFermenterAndStillStatuses();
  return runId;
}

function persistRunBotanicals(runId: number, botanicals: GinBotanicalInput[]): void {
  runQuery('DELETE FROM distillation_run_botanicals WHERE distillation_run_id = ?', [runId]);
  activeGinBotanicals(botanicals).forEach((line, index) => {
    insertRow(
      `INSERT INTO distillation_run_botanicals
        (distillation_run_id, name, amount, weight, weight_unit, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [runId, line.name, line.amount, line.weight, line.weight_unit, index],
    );
  });
}

export function getRunBotanicals(runId?: number): DistillationRunBotanical[] {
  if (runId != null) {
    return queryAll<DistillationRunBotanical>(
      `SELECT * FROM distillation_run_botanicals WHERE distillation_run_id = ? ORDER BY sort_order, id`,
      [runId],
    );
  }
  return queryAll<DistillationRunBotanical>(
    'SELECT * FROM distillation_run_botanicals ORDER BY distillation_run_id, sort_order, id',
  );
}

export function getGinRecipes(): GinRecipe[] {
  const recipes = queryAll<Omit<GinRecipe, 'botanicals'>>('SELECT * FROM gin_recipes ORDER BY name COLLATE NOCASE');
  const lines = queryAll<GinRecipeBotanical>(
    'SELECT * FROM gin_recipe_botanicals ORDER BY sort_order, id',
  );
  const byRecipe = new Map<number, GinRecipeBotanical[]>();
  for (const line of lines) {
    const bucket = byRecipe.get(line.gin_recipe_id) ?? [];
    bucket.push(line);
    byRecipe.set(line.gin_recipe_id, bucket);
  }
  return recipes.map((recipe) => ({
    ...recipe,
    botanicals: byRecipe.get(recipe.id) ?? [],
  }));
}

export function saveGinRecipe(
  recipe: { name: string; notes: string },
  id: number | undefined,
  botanicals: GinBotanicalInput[],
): number {
  const name = recipe.name.trim();
  if (!name) throw new Error('Enter a name for the gin recipe.');
  const lines = activeGinBotanicals(botanicals);
  if (lines.length === 0) {
    throw new Error('Add at least one botanical with a weight.');
  }
  const named = queryOne<{ id: number }>(
    'SELECT id FROM gin_recipes WHERE name = ? COLLATE NOCASE AND (? IS NULL OR id != ?)',
    [name, id ?? null, id ?? 0],
  );
  if (named) throw new Error(`A gin recipe named "${name}" already exists.`);
  const notes = recipe.notes.trim();
  let recipeId = id ?? 0;
  if (id) {
    runQuery(
      `UPDATE gin_recipes SET name=?, notes=?, updated_at=datetime('now') WHERE id=?`,
      [name, notes, id],
    );
  } else {
    recipeId = insertRow(
      'INSERT INTO gin_recipes (name, notes) VALUES (?, ?)',
      [name, notes],
    );
  }
  runQuery('DELETE FROM gin_recipe_botanicals WHERE gin_recipe_id = ?', [recipeId]);
  lines.forEach((line, index) => {
    insertRow(
      `INSERT INTO gin_recipe_botanicals
        (gin_recipe_id, name, amount, weight, weight_unit, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [recipeId, line.name, line.amount, line.weight, normalizeBotanicalWeightUnit(line.weight_unit), index],
    );
  });
  return recipeId;
}

export function deleteGinRecipe(id: number): void {
  runQuery('DELETE FROM gin_recipe_botanicals WHERE gin_recipe_id = ?', [id]);
  runQuery('DELETE FROM gin_recipes WHERE id = ?', [id]);
}

export function deleteDistillationRun(id: number): void {
  const run = queryOne<DistillationRun>('SELECT * FROM distillation_runs WHERE id = ?', [id]);
  if (run && distillationRunActivelyChargesFermenter(run.status)) {
    revertFermenterChargeFromRun(run);
  }
  if (run && stillRunOccupiesEquipment(run.status)) {
    releaseStillAfterRunningRun(run, '', 'complete');
  }
  runQuery('DELETE FROM distillation_run_botanicals WHERE distillation_run_id = ?', [id]);
  runQuery('DELETE FROM distillation_runs WHERE id = ?', [id]);
  syncHoldingTankStatuses();
  syncFermenterAndStillStatuses();
}

export function getDistillationCuts(runId: number): DistillationCutView[] {
  return queryAll(
    `SELECT c.*, fe.name as holding_tank_name
     FROM distillation_cuts c
     LEFT JOIN floor_equipment fe ON fe.id = c.holding_tank_equipment_id
     WHERE c.distillation_run_id = ?
     ORDER BY c.start_time`,
    [runId],
  );
}

export function saveDistillationCut(cut: Omit<DistillationCut, 'id'>, id?: number): void {
  assertEnteredAbv(cut.abv, 'Cut ABV');
  const run = queryOne<{ status: string }>(
    'SELECT status FROM distillation_runs WHERE id = ?',
    [cut.distillation_run_id],
  );
  if (run?.status === 'complete') {
    throw new Error('Cannot add or change cuts on a completed distillation run.');
  }
  if (cut.cut_type === 'heads') {
    const existingHeads = queryOne<{ id: number }>(
      `SELECT id FROM distillation_cuts
       WHERE distillation_run_id = ? AND cut_type = 'heads' AND (? IS NULL OR id != ?)`,
      [cut.distillation_run_id, id ?? null, id ?? 0],
    );
    if (existingHeads) {
      throw new Error('Heads can only be recorded once per run.');
    }
  }
  if (cut.holding_tank_equipment_id != null && cut.volume_gal > 0) {
    const runType = queryOne<{ run_type: string }>(
      'SELECT run_type FROM distillation_runs WHERE id = ?',
      [cut.distillation_run_id],
    )?.run_type;
    const spiritRunHolding = isSpiritStyleRun(runType)
      && cut.cut_type !== 'heads'
      && isSpiritRunCutHoldingTank(cut.holding_tank_equipment_id);
    if (!isCollectionVesselEquipmentId(cut.holding_tank_equipment_id) && !spiritRunHolding) {
      throw new Error('Distillation cuts must be collected into a collection vessel (or leave heads empty to discard).');
    }
    if (!plannedRecordSkipsEquipmentStatus(run?.status)) {
      assertEquipmentUsableForProduction(
        cut.holding_tank_equipment_id,
        spiritRunHolding ? 'High wines storage tank' : 'Collection vessel',
      );
    }
    if (
      isCollectionVesselEquipmentId(cut.holding_tank_equipment_id)
      && !collectionVesselAcceptsCutType(cut.holding_tank_equipment_id, cut.cut_type, id)
    ) {
      const stored = getCollectionVesselStoredCutType(cut.holding_tank_equipment_id, id);
      throw new Error(
        stored
          ? collectionVesselCutMixMessage(stored, cut.cut_type)
          : `This collection vessel cannot accept ${cut.cut_type} cuts.`,
      );
    }
  }
  if (id) {
    runQuery(
      `UPDATE distillation_cuts SET cut_type=?, holding_tank_equipment_id=?, start_time=?, end_time=?, volume_gal=?, abv=?, notes=? WHERE id=?`,
      [
        cut.cut_type,
        cut.holding_tank_equipment_id,
        cut.start_time,
        cut.end_time,
        cut.volume_gal,
        cut.abv,
        cut.notes,
        id,
      ],
    );
  } else {
    insertRow(
      `INSERT INTO distillation_cuts (distillation_run_id, cut_type, holding_tank_equipment_id, start_time, end_time, volume_gal, abv, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cut.distillation_run_id,
        cut.cut_type,
        cut.holding_tank_equipment_id,
        cut.start_time,
        cut.end_time,
        cut.volume_gal,
        cut.abv,
        cut.notes,
      ],
    );
  }
  syncHoldingTankStatuses();
}

export function deleteDistillationCut(id: number): void {
  const cut = queryOne<{ distillation_run_id: number }>(
    'SELECT distillation_run_id FROM distillation_cuts WHERE id = ?',
    [id],
  );
  if (cut) {
    const run = queryOne<{ status: string }>(
      'SELECT status FROM distillation_runs WHERE id = ?',
      [cut.distillation_run_id],
    );
    if (run?.status === 'complete') {
      throw new Error('Cannot add or change cuts on a completed distillation run.');
    }
  }
  runQuery('DELETE FROM distillation_cuts WHERE id = ?', [id]);
  syncHoldingTankStatuses();
}

// ── Barrels ────────────────────────────────────────────────

export function getWarehouseLocations(): WarehouseLocation[] {
  return queryAll<WarehouseLocation>(
    'SELECT * FROM warehouse_locations ORDER BY name COLLATE NOCASE',
  );
}

export function saveWarehouseLocation(name: string, options?: { rejectDuplicate?: boolean }): WarehouseLocation {
  const error = warehouseLocationNameError(name);
  if (error) throw new Error(error);
  const normalized = normalizeWarehouseLocationName(name);
  const existing = queryOne<WarehouseLocation>(
    'SELECT * FROM warehouse_locations WHERE name = ? COLLATE NOCASE',
    [normalized],
  );
  if (existing) {
    if (options?.rejectDuplicate) {
      throw new Error(`${existing.name} is already a warehouse location.`);
    }
    return existing;
  }
  const id = insertRow(
    'INSERT INTO warehouse_locations (name) VALUES (?)',
    [normalized],
  );
  return queryOne<WarehouseLocation>('SELECT * FROM warehouse_locations WHERE id = ?', [id])!;
}

export function deleteWarehouseLocation(id: number): void {
  const location = queryOne<WarehouseLocation>(
    'SELECT * FROM warehouse_locations WHERE id = ?',
    [id],
  );
  if (!location) return;
  const inUse = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM barrels
     WHERE TRIM(warehouse_location) != ''
       AND warehouse_location = ? COLLATE NOCASE`,
    [location.name],
  );
  if ((inUse?.count ?? 0) > 0) {
    throw new Error(`${location.name} still has barrels. Move them before removing this location.`);
  }
  runQuery('DELETE FROM warehouse_locations WHERE id = ?', [id]);
}

export function getBarrels(): Barrel[] {
  return queryAll<Barrel>(
    'SELECT * FROM barrels ORDER BY fill_date DESC',
  );
}

/** Aging barrels with spirit available for barrel blend recipes and production pulls. */
export function getBarrelsForBlend(): Barrel[] {
  return getBarrels().filter((b) => b.status === 'aging' && b.current_volume_gal > 0);
}

export function saveBarrel(barrel: Omit<Barrel, 'id' | 'created_at'>, id?: number): number | void {
  assertEnteredAbv(barrel.initial_abv, 'Initial ABV');
  const warehouse_location = normalizeWarehouseLocationName(barrel.warehouse_location);
  if (warehouse_location) saveWarehouseLocation(warehouse_location);
  if (id) {
    runQuery(
      `UPDATE barrels SET barrel_number=?, wood_type=?, capacity_gal=?, fill_date=?, spirit_type=?, source_run_id=?, source_holding_tank_equipment_id=?, initial_abv=?, current_volume_gal=?, warehouse_location=?, status=?, notes=? WHERE id=?`,
      [
        barrel.barrel_number,
        barrel.wood_type,
        barrel.capacity_gal,
        barrel.fill_date,
        barrel.spirit_type,
        barrel.source_run_id,
        barrel.source_holding_tank_equipment_id,
        barrel.initial_abv,
        barrel.current_volume_gal,
        warehouse_location,
        barrel.status,
        barrel.notes,
        id,
      ],
    );
    return;
  }
  deductOneBarrelFromInventory();
  return insertRow(
    `INSERT INTO barrels (barrel_number, wood_type, capacity_gal, fill_date, spirit_type, source_run_id, source_holding_tank_equipment_id, initial_abv, current_volume_gal, warehouse_location, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      barrel.barrel_number,
      barrel.wood_type,
      barrel.capacity_gal,
      barrel.fill_date,
      barrel.spirit_type,
      barrel.source_run_id,
      barrel.source_holding_tank_equipment_id,
      barrel.initial_abv,
      barrel.current_volume_gal,
      warehouse_location,
      barrel.status,
      barrel.notes,
    ],
  );
}

/** Register a new barrel and transfer the initial fill from a holding tank (ledger + barrel_fills). */
export function createBarrelFromHoldingTank(
  barrel: Omit<Barrel, 'id' | 'created_at' | 'current_volume_gal' | 'initial_abv'>,
  sourceHoldingTankEquipmentId: number,
  volumeGal: number,
): number {
  if (!(volumeGal > 0)) throw new Error('Initial fill volume must be greater than zero.');
  const id = saveBarrel({
    ...barrel,
    source_holding_tank_equipment_id: sourceHoldingTankEquipmentId,
    source_run_id: null,
    current_volume_gal: 0,
    initial_abv: 0,
  }) as number;
  fillBarrelFromHoldingTank({
    barrelId: id,
    sourceHoldingTankEquipmentId,
    volumeGal,
    fillDate: barrel.fill_date,
    spiritType: barrel.spirit_type,
  });
  return id;
}

export function deleteBarrel(id: number): void {
  runQuery('DELETE FROM barrels WHERE id = ?', [id]);
}

export function getBarrelFills(barrelId: number): BarrelFill[] {
  return queryAll<BarrelFill>(
    'SELECT * FROM barrel_fills WHERE barrel_id = ? ORDER BY fill_date DESC, id DESC',
    [barrelId],
  );
}

export interface FillBarrelFromTankInput {
  barrelId: number;
  sourceHoldingTankEquipmentId: number;
  volumeGal: number;
  fillDate: string;
  spiritType?: string;
  notes?: string;
}

/** Transfer spirit from a holding tank into a barrel; deducts from tank ledger. */
export function fillBarrelFromHoldingTank(input: FillBarrelFromTankInput): void {
  const barrel = queryOne<Barrel>('SELECT * FROM barrels WHERE id = ?', [input.barrelId]);
  if (!barrel) throw new Error('Barrel not found.');
  if (barrel.status === 'dumped') throw new Error('Cannot fill a dumped barrel.');
  if (!(input.volumeGal > 0)) throw new Error('Fill volume must be greater than zero.');

  const tank = queryOne<FloorEquipment>(
    `SELECT * FROM floor_equipment WHERE id = ? AND equipment_type IN ('holding_tank', 'collection_vessel')`,
    [input.sourceHoldingTankEquipmentId],
  );
  if (!tank) throw new Error('Holding tank not found.');

  const available = getHoldingTankContents(input.sourceHoldingTankEquipmentId);
  if (input.volumeGal > available.volume_gal + 0.01) {
    throw new Error(
      `Only ${available.volume_gal.toFixed(1)} gal available in ${tank.name}; requested ${input.volumeGal.toFixed(1)} gal.`,
    );
  }

  const headroom = barrel.capacity_gal - barrel.current_volume_gal;
  if (input.volumeGal > headroom + 0.01) {
    throw new Error(
      `Barrel ${barrel.barrel_number} has ${headroom.toFixed(1)} gal headroom (${barrel.capacity_gal} gal capacity).`,
    );
  }

  const fillAbv = available.abv;
  const newVolume = Math.round((barrel.current_volume_gal + input.volumeGal) * 1000) / 1000;
  const wasEmpty = barrel.current_volume_gal <= 0.01;
  let newAbv = fillAbv;
  if (!wasEmpty && newVolume > 0) {
    newAbv = ((barrel.current_volume_gal * barrel.initial_abv) + (input.volumeGal * fillAbv)) / newVolume;
    newAbv = Math.round(newAbv * 1000) / 1000;
  }

  insertRow(
    `INSERT INTO barrel_fills (barrel_id, source_holding_tank_equipment_id, volume_gal, abv, fill_date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.barrelId,
      input.sourceHoldingTankEquipmentId,
      input.volumeGal,
      fillAbv,
      input.fillDate,
      input.notes?.trim() ?? '',
    ],
  );

  const spiritType = input.spiritType?.trim() || barrel.spirit_type;
  const fillDate = wasEmpty ? input.fillDate : barrel.fill_date;
  const notes = input.notes?.trim()
    ? `${barrel.notes ? `${barrel.notes}\n` : ''}${input.notes.trim()}`
    : barrel.notes;

  runQuery(
    `UPDATE barrels SET
      current_volume_gal = ?,
      initial_abv = ?,
      status = 'aging',
      fill_date = ?,
      spirit_type = ?,
      notes = ?,
      source_holding_tank_equipment_id = COALESCE(source_holding_tank_equipment_id, ?)
     WHERE id = ?`,
    [
      newVolume,
      newAbv,
      fillDate,
      spiritType,
      notes,
      input.sourceHoldingTankEquipmentId,
      input.barrelId,
    ],
  );

  syncHoldingTankStatuses();
}

// ── Bottling ───────────────────────────────────────────────

function attachBottlingRunLines(runs: BottlingRun[]): BottlingRunView[] {
  const allLines = queryAll<BottlingRunLine>(
    'SELECT * FROM bottling_run_lines ORDER BY sort_order, id',
  );
  const linesByRun = new Map<number, BottlingRunLine[]>();
  for (const line of allLines) {
    const bucket = linesByRun.get(line.bottling_run_id) ?? [];
    bucket.push(line);
    linesByRun.set(line.bottling_run_id, bucket);
  }
  return runs.map((run) => {
    const stored = linesByRun.get(run.id);
    if (stored && stored.length > 0) {
      return { ...run, lines: stored };
    }
    if (run.bottle_count > 0) {
      return {
        ...run,
        lines: [{
          id: 0,
          bottling_run_id: run.id,
          packaging_bottle: run.packaging_bottle,
          bottle_size_ml: run.bottle_size_ml,
          bottle_count: run.bottle_count,
          sort_order: 0,
        }],
      };
    }
    return { ...run, lines: [] };
  });
}

function persistBottlingRunLines(runId: number, lines: BottlingRunLineInput[]): void {
  runQuery('DELETE FROM bottling_run_lines WHERE bottling_run_id = ?', [runId]);
  lines.forEach((line, index) => {
    if (line.bottle_count <= 0 || line.bottle_size_ml <= 0) return;
    insertRow(
      `INSERT INTO bottling_run_lines (bottling_run_id, packaging_bottle, bottle_size_ml, bottle_count, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [runId, line.packaging_bottle, line.bottle_size_ml, line.bottle_count, index],
    );
  });
}

export function getBottlingRuns(): BottlingRunView[] {
  const runs = queryAll<BottlingRun>(
    'SELECT * FROM bottling_runs ORDER BY bottling_date DESC',
  );
  return attachBottlingRunLines(runs);
}

export function getBottlingRunLines(bottlingRunId: number): BottlingRunLine[] {
  return queryAll<BottlingRunLine>(
    'SELECT * FROM bottling_run_lines WHERE bottling_run_id = ? ORDER BY sort_order, id',
    [bottlingRunId],
  );
}

export function saveBottlingRun(
  run: Omit<BottlingRun, 'id' | 'created_at'>,
  lines: BottlingRunLineInput[],
  id?: number,
): void {
  assertEnteredAbv(run.final_abv, 'Final ABV');
  const activeLines = lines.filter((line) => line.bottle_count > 0 && line.bottle_size_ml > 0);
  const previousLines = id ? bottlingLinesToInventoryInput(getBottlingRunLines(id)) : [];
  const fromTank = run.source_holding_tank_equipment_id != null;
  const sourceBarrelId = fromTank ? null : run.source_barrel_id;
  const sourceTankId = fromTank ? run.source_holding_tank_equipment_id : null;
  if (sourceTankId) {
    assertEquipmentUsableForProduction(sourceTankId, 'Source tank');
  }
  const totalCount = activeLines.reduce((sum, line) => sum + line.bottle_count, 0);
  const bottledVolumeGal = totalCount > 0
    ? activeLines.reduce((sum, line) => sum + mlToGallons(line.bottle_count * line.bottle_size_ml), 0)
    : null;
  let sourceVolumeGal: number | null = null;
  let volumeVarianceGal: number | null = null;
  if (fromTank && sourceTankId && bottledVolumeGal != null && bottledVolumeGal > 0) {
    const available = getHoldingTankContents(sourceTankId, undefined, undefined, id);
    sourceVolumeGal = available.volume_gal;
    volumeVarianceGal = bottledVolumeGal - sourceVolumeGal;
  }
  const packagingSummary = activeLines.length === 1
    ? activeLines[0].packaging_bottle
    : activeLines.length > 1
      ? 'Multiple'
      : '';
  const headerSizeMl = activeLines.length === 1 ? activeLines[0].bottle_size_ml : 0;

  const header = {
    ...run,
    packaging_bottle: packagingSummary,
    bottle_size_ml: headerSizeMl,
    bottle_count: totalCount,
    source_volume_gal: sourceVolumeGal,
    bottled_volume_gal: fromTank ? bottledVolumeGal : null,
    volume_variance_gal: fromTank ? volumeVarianceGal : null,
  };

  let runId = id;
  if (runId) {
    runQuery(
      `UPDATE bottling_runs SET batch_number=?, source_barrel_id=?, source_holding_tank_equipment_id=?, source_volume_gal=?, bottled_volume_gal=?, volume_variance_gal=?, source_run_id=?, bottling_date=?, packaging_bottle=?, bottle_size_ml=?, bottle_count=?, final_abv=?, product_name=?, lot_number=?, notes=? WHERE id=?`,
      [header.batch_number, sourceBarrelId, sourceTankId, header.source_volume_gal, header.bottled_volume_gal, header.volume_variance_gal, header.source_run_id, header.bottling_date, header.packaging_bottle, header.bottle_size_ml, header.bottle_count, header.final_abv, header.product_name, header.lot_number, header.notes, runId],
    );
    persistBottlingRunLines(runId, activeLines);
  } else {
    runId = insertRow(
      `INSERT INTO bottling_runs (batch_number, source_barrel_id, source_holding_tank_equipment_id, source_volume_gal, bottled_volume_gal, volume_variance_gal, source_run_id, bottling_date, packaging_bottle, bottle_size_ml, bottle_count, final_abv, product_name, lot_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [header.batch_number, sourceBarrelId, sourceTankId, header.source_volume_gal, header.bottled_volume_gal, header.volume_variance_gal, header.source_run_id, header.bottling_date, header.packaging_bottle, header.bottle_size_ml, header.bottle_count, header.final_abv, header.product_name, header.lot_number, header.notes],
    );
    persistBottlingRunLines(runId, activeLines);
  }
  syncBottlingPackagingInventory(previousLines, activeLines);
  syncHoldingTankStatuses();
}

export function deleteBottlingRun(id: number): void {
  const previousLines = bottlingLinesToInventoryInput(getBottlingRunLines(id));
  syncBottlingPackagingInventory(previousLines, []);
  runQuery('DELETE FROM bottling_runs WHERE id = ?', [id]);
  syncHoldingTankStatuses();
}

// ── Blend Recipes ──────────────────────────────────────────

function attachBlendRecipeDetails(
  recipes: (BlendRecipe & { current_version_number?: number | null })[],
): BlendRecipeView[] {
  const spiritSources = queryAll<BlendRecipeSpiritSource>(
    'SELECT * FROM blend_recipe_spirit_sources ORDER BY sort_order, id',
  );
  const ingredients = queryAll<BlendRecipeIngredient>(
    'SELECT * FROM blend_recipe_ingredients ORDER BY id',
  );
  const spiritsByRecipe = new Map<number, BlendRecipeSpiritSource[]>();
  const ingredientsByRecipe = new Map<number, BlendRecipeIngredient[]>();
  for (const source of spiritSources) {
    const bucket = spiritsByRecipe.get(source.blend_recipe_id) ?? [];
    bucket.push(source);
    spiritsByRecipe.set(source.blend_recipe_id, bucket);
  }
  for (const ingredient of ingredients) {
    const bucket = ingredientsByRecipe.get(ingredient.blend_recipe_id) ?? [];
    bucket.push(ingredient);
    ingredientsByRecipe.set(ingredient.blend_recipe_id, bucket);
  }
  return recipes.map((recipe) => ({
    ...recipe,
    current_version_number: recipe.current_version_number ?? null,
    spirit_sources: spiritsByRecipe.get(recipe.id) ?? [],
    ingredients: ingredientsByRecipe.get(recipe.id) ?? [],
  }));
}

const BLEND_RECIPE_SELECT = `
  SELECT r.*,
    (SELECT MAX(v.version_number) FROM blend_recipe_versions v WHERE v.blend_recipe_id = r.id) AS current_version_number
  FROM blend_recipes r
`;

function persistBlendRecipeSpiritSources(
  recipeId: number,
  sources: BlendRecipeSpiritSourceInput[],
): void {
  runQuery('DELETE FROM blend_recipe_spirit_sources WHERE blend_recipe_id = ?', [recipeId]);
  sources
    .filter((source) => source.volume_gal > 0)
    .forEach((source, index) => {
      insertRow(
        `INSERT INTO blend_recipe_spirit_sources (blend_recipe_id, spirit_label, volume_gal, abv, barrel_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [recipeId, source.spirit_label, source.volume_gal, source.abv, source.barrel_id ?? null, index],
      );
    });
}

function persistBlendRecipeIngredients(
  recipeId: number,
  ingredients: BlendIngredientInput[],
): void {
  runQuery('DELETE FROM blend_recipe_ingredients WHERE blend_recipe_id = ?', [recipeId]);
  ingredients
    .filter((ingredient) => ingredient.amount > 0 || ingredient.name.trim())
    .forEach((ingredient) => {
      insertRow(
        `INSERT INTO blend_recipe_ingredients (
          blend_recipe_id, ingredient_type, name, amount, unit, abv, cost_per_unit, lot_number, inventory_item_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recipeId,
          ingredient.ingredient_type,
          ingredient.name,
          ingredient.amount,
          ingredient.unit,
          ingredient.abv ?? null,
          ingredient.cost_per_unit ?? null,
          ingredient.lot_number ?? '',
          ingredient.inventory_item_id ?? null,
          ingredient.notes,
        ],
      );
    });
}

export function getBlendRecipes(): BlendRecipeView[] {
  const recipes = queryAll<BlendRecipe & { current_version_number: number | null }>(
    `${BLEND_RECIPE_SELECT} ORDER BY r.name`,
  );
  return attachBlendRecipeDetails(recipes);
}

export function getBlendRecipe(id: number): BlendRecipeView | undefined {
  const recipe = queryOne<BlendRecipe & { current_version_number: number | null }>(
    `${BLEND_RECIPE_SELECT} WHERE r.id = ?`,
    [id],
  );
  if (!recipe) return undefined;
  return attachBlendRecipeDetails([recipe])[0];
}

export function getBlendRecipeVersions(recipeId: number): BlendRecipeVersion[] {
  return queryAll<BlendRecipeVersion>(
    'SELECT * FROM blend_recipe_versions WHERE blend_recipe_id = ? ORDER BY version_number DESC',
    [recipeId],
  );
}

export function getBlendRecipeVersion(id: number): BlendRecipeVersion | null {
  return queryOne<BlendRecipeVersion>(
    'SELECT * FROM blend_recipe_versions WHERE id = ?',
    [id],
  );
}

export function getLatestBlendRecipeVersion(recipeId: number): BlendRecipeVersion | null {
  return queryOne<BlendRecipeVersion>(
    `SELECT * FROM blend_recipe_versions WHERE blend_recipe_id = ? ORDER BY version_number DESC LIMIT 1`,
    [recipeId],
  );
}

function recordBlendRecipeVersion(
  recipeId: number,
  snapshot: ReturnType<typeof buildBlendRecipeSnapshot>,
): number {
  const key = blendRecipeSnapshotKey(snapshot);
  const latest = queryOne<{ id: number; version_number: number; snapshot_json: string }>(
    `SELECT id, version_number, snapshot_json FROM blend_recipe_versions
     WHERE blend_recipe_id = ? ORDER BY version_number DESC LIMIT 1`,
    [recipeId],
  );
  if (latest) {
    const previous = parseBlendRecipeSnapshot(latest.snapshot_json);
    if (previous && blendRecipeSnapshotKey(buildBlendRecipeSnapshot(previous)) === key) {
      return latest.id;
    }
  }
  const next = (latest?.version_number ?? 0) + 1;
  return insertRow(
    `INSERT INTO blend_recipe_versions (blend_recipe_id, version_number, snapshot_json, notes)
     VALUES (?, ?, ?, ?)`,
    [recipeId, next, JSON.stringify(snapshot), ''],
  );
}

export function saveBlendRecipe(
  recipe: Omit<BlendRecipe, 'id' | 'created_at' | 'updated_at'>,
  spiritSources: BlendRecipeSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  id?: number,
): number {
  if (!recipe.name.trim()) throw new Error('Recipe name is required.');
  assertEnteredAbv(recipe.target_abv, 'Target ABV');
  for (const source of spiritSources) assertEnteredAbv(source.abv, 'Spirit ABV');
  for (const ingredient of ingredients) assertEnteredAbv(ingredient.abv, 'Flavoring ABV');

  const sourceType = recipe.source_type ?? 'tank';

  if (id) {
    runQuery(
      `UPDATE blend_recipes SET
        name = ?, product_name = ?, target_abv = ?, target_brix = ?, target_sugar_g_per_l = ?, target_volume_gal = ?,
        scale_factor = ?, source_type = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        recipe.name.trim(),
        recipe.product_name,
        recipe.target_abv,
        recipe.target_brix,
        recipe.target_sugar_g_per_l ?? null,
        recipe.target_volume_gal ?? null,
        recipe.scale_factor ?? 1,
        sourceType,
        recipe.notes,
        id,
      ],
    );
  } else {
    id = insertRow(
      `INSERT INTO blend_recipes (
        name, product_name, target_abv, target_brix, target_sugar_g_per_l, target_volume_gal, scale_factor, source_type, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipe.name.trim(),
        recipe.product_name,
        recipe.target_abv,
        recipe.target_brix,
        recipe.target_sugar_g_per_l ?? null,
        recipe.target_volume_gal ?? null,
        recipe.scale_factor ?? 1,
        sourceType,
        recipe.notes,
      ],
    );
  }

  persistBlendRecipeSpiritSources(id, spiritSources);
  persistBlendRecipeIngredients(id, ingredients);
  recordBlendRecipeVersion(id, buildBlendRecipeSnapshot({
    product_name: recipe.product_name,
    target_abv: recipe.target_abv,
    target_brix: recipe.target_brix,
    target_sugar_g_per_l: recipe.target_sugar_g_per_l ?? null,
    target_volume_gal: recipe.target_volume_gal ?? null,
    scale_factor: recipe.scale_factor ?? 1,
    source_type: sourceType,
    notes: recipe.notes,
    spirit_sources: spiritSources,
    ingredients,
  }));
  return id;
}

export function deleteBlendRecipe(id: number): void {
  runQuery('UPDATE blend_products SET blend_recipe_version_id = NULL WHERE blend_recipe_id = ?', [id]);
  runQuery('DELETE FROM blend_recipe_versions WHERE blend_recipe_id = ?', [id]);
  runQuery('DELETE FROM blend_recipes WHERE id = ?', [id]);
}

export function blendRecipeSpiritSourcesFromWizard(
  sources: BlendSpiritSourceInput[],
): BlendRecipeSpiritSourceInput[] {
  return sources
    .filter((source) => source.volume_gal > 0)
    .map((source, index) => {
      const tank = source.holding_tank_equipment_id
        ? queryOne<{ name: string }>(
          'SELECT name FROM floor_equipment WHERE id = ?',
          [source.holding_tank_equipment_id],
        )
        : null;
      return {
        spirit_label: tank?.name ?? `Spirit ${index + 1}`,
        volume_gal: source.volume_gal,
        abv: source.abv,
      };
    });
}

export function saveBlendRecipeFromWizard(
  name: string,
  product: Pick<BlendProduct, 'product_name' | 'target_abv' | 'target_brix' | 'scale_factor' | 'notes'>,
  spiritSources: BlendSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  id?: number,
): number {
  return saveBlendRecipe(
    {
      name,
      product_name: product.product_name,
      target_abv: product.target_abv,
      target_brix: product.target_brix,
      scale_factor: product.scale_factor ?? 1,
      source_type: 'tank',
      notes: product.notes,
      target_sugar_g_per_l: null,
      target_volume_gal: null,
    },
    blendRecipeSpiritSourcesFromWizard(spiritSources),
    ingredients.filter((ingredient) => ingredient.amount > 0 || ingredient.name.trim()),
    id,
  );
}

// ── Blending ───────────────────────────────────────────────

export type BlendFormulaSaveInput = Omit<
  BlendProduct,
  'id' | 'created_at' | 'executed_at'
>;

export function getBlendProducts(): BlendProductView[] {
  return queryAll(
    `SELECT b.*, fe.name as source_tank_name, out_fe.name as output_tank_name, br.name as blend_recipe_name,
        brv.version_number as blend_recipe_version_number
     FROM blend_products b
     JOIN floor_equipment fe ON fe.id = b.source_holding_tank_equipment_id
     LEFT JOIN floor_equipment out_fe ON out_fe.id = b.output_holding_tank_equipment_id
     LEFT JOIN blend_recipes br ON br.id = b.blend_recipe_id
     LEFT JOIN blend_recipe_versions brv ON brv.id = b.blend_recipe_version_id
     ORDER BY b.blend_date DESC`,
  );
}

export function getBlendIngredients(blendProductId: number): BlendIngredient[] {
  return queryAll(
    'SELECT * FROM blend_ingredients WHERE blend_product_id = ? ORDER BY id',
    [blendProductId],
  );
}

export function getBlendSpiritSources(blendProductId: number): BlendSpiritSource[] {
  return queryAll(
    `SELECT bss.*, fe.name as tank_name, b.barrel_number
     FROM blend_spirit_sources bss
     LEFT JOIN floor_equipment fe ON fe.id = bss.holding_tank_equipment_id
     LEFT JOIN barrels b ON b.id = bss.barrel_id
     WHERE bss.blend_product_id = ?
     ORDER BY bss.sort_order, bss.id`,
    [blendProductId],
  );
}

export function getBlendFormulaVersions(blendProductId: number): BlendFormulaVersion[] {
  return queryAll(
    'SELECT * FROM blend_formula_versions WHERE blend_product_id = ? ORDER BY version_number DESC',
    [blendProductId],
  );
}

function normalizeSpiritSources(
  product: Pick<BlendFormulaSaveInput, 'source_holding_tank_equipment_id' | 'base_spirit_volume_gal' | 'base_spirit_abv'>,
  spiritSources: BlendSpiritSourceInput[],
): BlendSpiritSourceInput[] {
  if (spiritSources.length > 0) return spiritSources;
  if (product.source_holding_tank_equipment_id > 0 && product.base_spirit_volume_gal > 0) {
    return [{
      holding_tank_equipment_id: product.source_holding_tank_equipment_id,
      volume_gal: product.base_spirit_volume_gal,
      abv: product.base_spirit_abv,
    }];
  }
  return [];
}

function persistSpiritSources(blendProductId: number, sources: BlendSpiritSourceInput[]): void {
  runQuery('DELETE FROM blend_spirit_sources WHERE blend_product_id = ?', [blendProductId]);
  sources.forEach((source, index) => {
    if (source.volume_gal <= 0) return;
    insertRow(
      `INSERT INTO blend_spirit_sources (blend_product_id, holding_tank_equipment_id, barrel_id, volume_gal, abv, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        blendProductId,
        source.holding_tank_equipment_id ?? 0,
        source.barrel_id ?? null,
        source.volume_gal,
        source.abv,
        index,
      ],
    );
  });
}

function persistIngredients(blendProductId: number, ingredients: BlendIngredientInput[]): void {
  runQuery('DELETE FROM blend_ingredients WHERE blend_product_id = ?', [blendProductId]);
  for (const ing of ingredients) {
    if (ing.amount <= 0 && !ing.name.trim()) continue;
    insertRow(
      `INSERT INTO blend_ingredients
       (blend_product_id, ingredient_type, name, amount, unit, abv, cost_per_unit, lot_number, inventory_item_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        blendProductId,
        ing.ingredient_type,
        ing.name,
        ing.amount,
        ing.unit,
        ing.abv ?? null,
        ing.cost_per_unit ?? null,
        ing.lot_number ?? '',
        ing.inventory_item_id ?? null,
        ing.notes,
      ],
    );
  }
}

function snapshotFormula(
  blendProductId: number,
  versionNumber: number,
  product: BlendFormulaSaveInput,
  spiritSources: BlendSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  formulation: ReturnType<typeof computeBlendFormulation>,
): void {
  insertRow(
    `INSERT INTO blend_formula_versions (blend_product_id, version_number, snapshot_json, notes)
     VALUES (?, ?, ?, ?)`,
    [
      blendProductId,
      versionNumber,
      JSON.stringify({
        product,
        spiritSources,
        ingredients,
        theoretical: formulation.theoretical,
        reconciliation: formulation.reconciliation,
        proofing: proofingRecordForBlend(
          toSpiritInputs(spiritSources),
          toAdditiveInputs(ingredients),
          product.target_abv,
          'preview',
        ),
        savedAt: new Date().toISOString(),
      }),
      product.notes,
    ],
  );
}

/** Save formula only — never mutates inventory or tank balances. */
export function saveBlendFormula(
  product: BlendFormulaSaveInput,
  spiritSources: BlendSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  id?: number,
): number {
  assertEnteredAbv(product.target_abv, 'Target ABV');
  assertEnteredAbv(product.actual_abv, 'Measured ABV');
  assertEnteredAbv(product.base_spirit_abv, 'Spirit ABV');
  for (const source of spiritSources) assertEnteredAbv(source.abv, 'Spirit ABV');
  for (const ingredient of ingredients) assertEnteredAbv(ingredient.abv, 'Flavoring ABV');

  const sources = normalizeSpiritSources(product, spiritSources);
  const primary = sources[0];
  const primaryTankId = primary?.holding_tank_equipment_id ?? product.source_holding_tank_equipment_id;
  const primaryVolume = primary?.volume_gal ?? product.base_spirit_volume_gal;
  const primaryAbv = primary?.abv ?? product.base_spirit_abv;

  const formulation = computeBlendFormulation(sources, ingredients, {
    volume_gal: product.actual_volume_gal,
    abv: product.actual_abv,
    density: product.actual_density,
    brix: product.actual_brix,
  });

  let formulaVersion = 1;
  if (id) {
    const existingVersion = queryOne<{ formula_version: number }>(
      'SELECT formula_version FROM blend_products WHERE id = ?',
      [id],
    );
    formulaVersion = (existingVersion?.formula_version ?? 1) + 1;
  }

  const finalVolume = formulation.reconciliation.effective.volumeGal ?? formulation.theoretical.volumeGal;
  const finalAbv = formulation.reconciliation.effective.abv ?? formulation.theoretical.abv;

  const row = {
    batch_number: product.batch_number,
    product_name: product.product_name,
    source_holding_tank_equipment_id: primaryTankId,
    base_spirit_volume_gal: primaryVolume,
    base_spirit_abv: primaryAbv,
    blend_date: product.blend_date,
    target_abv: product.target_abv,
    target_brix: product.target_brix,
    scale_factor: product.scale_factor ?? 1,
    formula_version: formulaVersion,
    formulation_phase: product.formulation_phase ?? 'theoretical',
    final_volume_gal: finalVolume ?? 0,
    final_abv: finalAbv ?? 0,
    theoretical_volume_gal: formulation.theoretical.volumeGal,
    theoretical_abv: formulation.theoretical.abv,
    theoretical_density: formulation.theoretical.density,
    theoretical_brix: formulation.theoretical.brix,
    actual_volume_gal: product.actual_volume_gal,
    actual_weight_lbs: product.actual_weight_lbs ?? null,
    actual_abv: product.actual_abv,
    actual_density: product.actual_density,
    actual_brix: product.actual_brix,
    status: product.status,
    output_holding_tank_equipment_id: product.output_holding_tank_equipment_id ?? null,
    blend_recipe_id: product.blend_recipe_id ?? null,
    blend_recipe_version_id: product.blend_recipe_version_id ?? null,
    assigned_user_id: product.assigned_user_id,
    assigned_user_name: product.assigned_user_name ?? '',
    notes: product.notes,
  };

  if (id) {
    const existing = queryOne<{ status: string }>('SELECT status FROM blend_products WHERE id = ?', [id]);
    if (existing?.status === 'executed' || existing?.status === 'bottled') {
      throw new Error('Executed blends cannot be edited — create a new formula version instead.');
    }
    runQuery(
      `UPDATE blend_products SET
        batch_number=?, product_name=?, source_holding_tank_equipment_id=?, base_spirit_volume_gal=?, base_spirit_abv=?,
        blend_date=?, target_abv=?, target_brix=?, scale_factor=?, formula_version=?, formulation_phase=?,
        final_volume_gal=?, final_abv=?, theoretical_volume_gal=?, theoretical_abv=?, theoretical_density=?, theoretical_brix=?,
        actual_volume_gal=?, actual_weight_lbs=?, actual_abv=?, actual_density=?, actual_brix=?, status=?, output_holding_tank_equipment_id=?, blend_recipe_id=?, blend_recipe_version_id=?, assigned_user_id=?, assigned_user_name=?, notes=?
       WHERE id=?`,
      [
        row.batch_number, row.product_name, row.source_holding_tank_equipment_id,
        row.base_spirit_volume_gal, row.base_spirit_abv, row.blend_date,
        row.target_abv, row.target_brix, row.scale_factor, row.formula_version, row.formulation_phase,
        row.final_volume_gal, row.final_abv,
        row.theoretical_volume_gal, row.theoretical_abv, row.theoretical_density, row.theoretical_brix,
        row.actual_volume_gal, row.actual_weight_lbs, row.actual_abv, row.actual_density, row.actual_brix,
        row.status, row.output_holding_tank_equipment_id, row.blend_recipe_id, row.blend_recipe_version_id, row.assigned_user_id, row.assigned_user_name, row.notes, id,
      ],
    );
  } else {
    id = insertRow(
      `INSERT INTO blend_products (
        batch_number, product_name, source_holding_tank_equipment_id, base_spirit_volume_gal, base_spirit_abv,
        blend_date, target_abv, target_brix, scale_factor, formula_version, formulation_phase,
        final_volume_gal, final_abv, theoretical_volume_gal, theoretical_abv, theoretical_density, theoretical_brix,
        actual_volume_gal, actual_weight_lbs, actual_abv, actual_density, actual_brix, status, output_holding_tank_equipment_id, blend_recipe_id, blend_recipe_version_id, assigned_user_id, assigned_user_name, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.batch_number, row.product_name, row.source_holding_tank_equipment_id,
        row.base_spirit_volume_gal, row.base_spirit_abv, row.blend_date,
        row.target_abv, row.target_brix, row.scale_factor, row.formula_version, row.formulation_phase,
        row.final_volume_gal, row.final_abv,
        row.theoretical_volume_gal, row.theoretical_abv, row.theoretical_density, row.theoretical_brix,
        row.actual_volume_gal, row.actual_weight_lbs, row.actual_abv, row.actual_density, row.actual_brix,
        row.status, row.output_holding_tank_equipment_id, row.blend_recipe_id, row.blend_recipe_version_id, row.assigned_user_id, row.assigned_user_name, row.notes,
      ],
    );
  }

  persistSpiritSources(id, sources);
  persistIngredients(id, ingredients);
  snapshotFormula(id, row.formula_version, product, sources, ingredients, formulation);
  return id;
}

/** @deprecated Use saveBlendFormula — kept for compatibility; does not touch inventory. */
export function saveBlendProduct(
  product: Omit<BlendProduct, 'id' | 'created_at' | 'final_volume_gal' | 'final_abv'>,
  ingredients: BlendIngredientInput[],
  id?: number,
): number {
  return saveBlendFormula(
    {
      ...product,
      target_brix: null,
      scale_factor: 1,
      formula_version: 1,
      formulation_phase: 'theoretical',
      final_volume_gal: 0,
      final_abv: 0,
      theoretical_volume_gal: null,
      theoretical_abv: null,
      theoretical_density: null,
      theoretical_brix: null,
      actual_volume_gal: null,
      actual_abv: null,
      actual_density: null,
      actual_brix: null,
    },
    [{
      holding_tank_equipment_id: product.source_holding_tank_equipment_id,
      volume_gal: product.base_spirit_volume_gal,
      abv: product.base_spirit_abv,
    }],
    ingredients,
    id,
  );
}

function assertSpiritAvailability(
  sources: BlendSpiritSourceInput[],
  excludeBlendId?: number,
): void {
  for (const source of sources) {
    if (source.volume_gal <= 0) continue;
    if (source.barrel_id) {
      const barrel = queryOne<{ barrel_number: string; current_volume_gal: number }>(
        'SELECT barrel_number, current_volume_gal FROM barrels WHERE id = ? AND status = ?',
        [source.barrel_id, 'aging'],
      );
      if (!barrel) {
        throw new Error('Selected barrel is not available for blending.');
      }
      if (source.volume_gal > barrel.current_volume_gal + 0.01) {
        throw new Error(
          `Only ${barrel.current_volume_gal.toFixed(1)} gal available in ${barrel.barrel_number}; formula requires ${source.volume_gal.toFixed(1)} gal.`,
        );
      }
      continue;
    }
    if (source.holding_tank_equipment_id <= 0) continue;
    const available = getHoldingTankContents(source.holding_tank_equipment_id, undefined, excludeBlendId);
    if (source.volume_gal > available.volume_gal + 0.01) {
      const tank = queryOne<{ name: string }>(
        'SELECT name FROM floor_equipment WHERE id = ?',
        [source.holding_tank_equipment_id],
      );
      throw new Error(
        `Only ${available.volume_gal.toFixed(1)} gal available in ${tank?.name ?? 'tank'}; formula requires ${source.volume_gal.toFixed(1)} gal.`,
      );
    }
  }
}

function inventoryDeductionsForBlend(
  ingredients: { inventory_item_id: number | null; amount: number; unit: string; name: string }[],
): { id: number; quantity: number }[] {
  const deductions: { id: number; quantity: number }[] = [];
  for (const ing of ingredients) {
    if (!ing.inventory_item_id || ing.amount <= 0) continue;
    const item = queryOne<{ unit: string; name: string }>(
      'SELECT unit, name FROM inventory_items WHERE id = ?',
      [ing.inventory_item_id],
    );
    if (!item) throw new Error(`Inventory item for ${ing.name} not found.`);
    const quantity = inventoryQuantityDelta(ing.amount, ing.unit, item.unit);
    if (quantity == null) {
      throw new Error(
        `${ing.name} is entered in ${ing.unit}, but ${item.name} is tracked in ${item.unit}. Use the same kind of unit before producing.`,
      );
    }
    deductions.push({ id: ing.inventory_item_id, quantity });
  }
  return deductions;
}

/** Approved execution — consumes tank spirit and inventory lots; deposits finished liquid into a holding tank. */
export function executeBlendProduct(id: number, outputTankId: number): void {
  const product = queryOne<BlendProduct>('SELECT * FROM blend_products WHERE id = ?', [id]);
  if (!product) throw new Error('Blend formula not found.');
  if (product.status === 'executed' || product.status === 'bottled' || product.status === 'blended') {
    throw new Error('This blend has already been executed.');
  }
  if (product.status !== 'approved') {
    throw new Error('Blend must be approved before execution.');
  }
  if (!outputTankId) {
    throw new Error('Choose a holding tank for the finished batch.');
  }

  const outputTank = queryOne<FloorEquipment>(
    `SELECT * FROM floor_equipment WHERE id = ? AND equipment_type = 'holding_tank'`,
    [outputTankId],
  );
  if (!outputTank) throw new Error('Output tank not found.');
  assertEquipmentUsableForProduction(outputTankId, 'Output tank');

  const spiritSources = getBlendSpiritSources(id).map((s) => ({
    holding_tank_equipment_id: s.holding_tank_equipment_id,
    barrel_id: s.barrel_id ?? null,
    volume_gal: s.volume_gal,
    abv: s.abv,
  }));
  const sources = normalizeSpiritSources(product, spiritSources);
  if (sources.length === 0 || sources.every((s) => s.volume_gal <= 0)) {
    throw new Error('Add at least one spirit source before execution.');
  }

  assertSpiritAvailability(sources, id);
  for (const source of sources) {
    if (source.holding_tank_equipment_id > 0) {
      assertEquipmentUsableForProduction(source.holding_tank_equipment_id, 'Spirit source tank');
    }
  }

  const ingredients = getBlendIngredients(id);
  const proofing = proofingRecordForBlend(
    sources.map((source) => ({ volumeGal: source.volume_gal, abv: source.abv })),
    ingredients.map((ingredient) => ({
      ingredientType: ingredient.ingredient_type,
      name: ingredient.name,
      amount: ingredient.amount,
      unit: ingredient.unit,
      abv: ingredient.abv,
      inventoryItemId: ingredient.inventory_item_id,
    })),
    product.target_abv,
    'post',
    {
      sourceLot: product.batch_number,
      batchId: String(id),
      trackProofingWater: ingredients.some(
        (ingredient) => ingredient.ingredient_type === 'water' && ingredient.inventory_item_id != null,
      ),
    },
  );
  if (proofing.applies && !proofing.ok) {
    throw new Error(proofing.message ?? 'Proofing validation failed. Inventory was not changed.');
  }

  const sourceTankIds = new Set(
    sources.map((s) => s.holding_tank_equipment_id).filter((tankId) => tankId > 0),
  );
  if (sourceTankIds.has(outputTankId)) {
    throw new Error('Finished batch cannot go into a tank you are pulling spirit from.');
  }

  for (const source of sources) {
    if (!source.barrel_id || source.volume_gal <= 0) continue;
    const barrel = queryOne<{ current_volume_gal: number }>(
      'SELECT current_volume_gal FROM barrels WHERE id = ?',
      [source.barrel_id],
    );
    if (!barrel) continue;
    const remaining = Math.max(0, barrel.current_volume_gal - source.volume_gal);
    const nextStatus = remaining <= 0.01 ? 'empty' : 'aging';
    runQuery(
      'UPDATE barrels SET current_volume_gal = ?, status = ? WHERE id = ?',
      [remaining, nextStatus, source.barrel_id],
    );
  }

  for (const deduction of inventoryDeductionsForBlend(ingredients)) {
    adjustInventory(deduction.id, -deduction.quantity);
  }

  const formulation = computeBlendFormulation(sources, ingredients.map((i) => ({
    ingredient_type: i.ingredient_type,
    name: i.name,
    amount: i.amount,
    unit: i.unit,
    abv: i.abv,
    cost_per_unit: i.cost_per_unit,
    lot_number: i.lot_number,
    inventory_item_id: i.inventory_item_id,
    notes: i.notes,
  })), {
    volume_gal: product.actual_volume_gal,
    abv: product.actual_abv,
    density: product.actual_density,
    brix: product.actual_brix,
  });

  const finalVolume = formulation.reconciliation.effective.volumeGal ?? formulation.theoretical.volumeGal ?? 0;
  const finalAbv = formulation.reconciliation.effective.abv ?? formulation.theoretical.abv ?? 0;

  if (finalVolume <= 0) {
    throw new Error('Expected batch volume must be greater than zero.');
  }

  runQuery(
    `UPDATE blend_products SET
      status = 'executed',
      executed_at = datetime('now'),
      final_volume_gal = ?,
      final_abv = ?,
      base_spirit_volume_gal = ?,
      base_spirit_abv = ?,
      source_holding_tank_equipment_id = ?,
      output_holding_tank_equipment_id = ?
     WHERE id = ?`,
    [
      finalVolume,
      finalAbv,
      sources[0]?.volume_gal ?? product.base_spirit_volume_gal,
      sources[0]?.abv ?? product.base_spirit_abv,
      sources[0]?.holding_tank_equipment_id ?? product.source_holding_tank_equipment_id,
      outputTankId,
      id,
    ],
  );

  if (proofing.applies && proofing.ok) {
    const version = queryOne<{ version_number: number }>(
      'SELECT COALESCE(MAX(version_number), 0) AS version_number FROM blend_formula_versions WHERE blend_product_id = ?',
      [id],
    );
    insertRow(
      `INSERT INTO blend_formula_versions (blend_product_id, version_number, snapshot_json, notes)
       VALUES (?, ?, ?, ?)`,
      [
        id,
        (version?.version_number ?? 0) + 1,
        proofing.snapshot,
        'Posted proofing calculation. This snapshot is not recomputed when the engine changes.',
      ],
    );
  }

  syncHoldingTankStatuses();
}

/**
 * Reverse an executed blend. The blending page requires an administrator email and password first.
 * Restores inventory and barrel pulls and removes
 * the finished batch from the output-tank ledger by returning status to approved.
 */
export function undoBlendProduction(id: number): void {
  const product = queryOne<BlendProduct>('SELECT * FROM blend_products WHERE id = ?', [id]);
  if (!product) throw new Error('Blend formula not found.');
  if (product.status !== 'executed') {
    throw new Error('Only executed batches can be undone. Bottled or blended batches cannot be reversed here.');
  }

  const outputTankId = product.output_holding_tank_equipment_id;
  if (outputTankId && product.final_volume_gal > 0.001) {
    const outputContents = getHoldingTankContents(outputTankId);
    if (outputContents.volume_gal + 0.01 < product.final_volume_gal) {
      const tank = queryOne<{ name: string }>(
        'SELECT name FROM floor_equipment WHERE id = ?',
        [outputTankId],
      );
      throw new Error(
        `${tank?.name ?? 'Output tank'} holds ${outputContents.volume_gal.toFixed(1)} gal; `
        + `this batch added ${product.final_volume_gal.toFixed(1)} gal. `
        + 'Transfer or adjust spirit before undoing production.',
      );
    }
  }

  const spiritSources = getBlendSpiritSources(id);
  for (const source of spiritSources) {
    if (!source.barrel_id || source.volume_gal <= 0) continue;
    const barrel = queryOne<{ current_volume_gal: number }>(
      'SELECT current_volume_gal FROM barrels WHERE id = ?',
      [source.barrel_id],
    );
    if (!barrel) continue;
    const restored = barrel.current_volume_gal + source.volume_gal;
    const nextStatus = restored > 0.01 ? 'aging' : 'empty';
    runQuery(
      'UPDATE barrels SET current_volume_gal = ?, status = ? WHERE id = ?',
      [restored, nextStatus, source.barrel_id],
    );
  }

  const ingredients = getBlendIngredients(id);
  for (const deduction of inventoryDeductionsForBlend(ingredients)) {
    adjustInventory(deduction.id, deduction.quantity);
  }

  runQuery(
    `UPDATE blend_products SET status = 'approved', executed_at = NULL WHERE id = ?`,
    [id],
  );

  syncHoldingTankStatuses();
}

/** Save post-production lab measurements on an executed batch. */
export function saveBlendVerification(
  id: number,
  data: Pick<BlendProduct, 'actual_abv' | 'actual_volume_gal' | 'actual_weight_lbs' | 'actual_brix'>,
): void {
  const product = queryOne<{ status: string }>('SELECT status FROM blend_products WHERE id = ?', [id]);
  if (!product) throw new Error('Blend not found.');
  assertEnteredAbv(data.actual_abv, 'Measured ABV');
  if (product.status !== 'executed' && product.status !== 'bottled' && product.status !== 'blended') {
    throw new Error('Final measurements can only be saved after production.');
  }
  runQuery(
    `UPDATE blend_products SET actual_abv = ?, actual_volume_gal = ?, actual_weight_lbs = ?, actual_brix = ? WHERE id = ?`,
    [data.actual_abv, data.actual_volume_gal, data.actual_weight_lbs, data.actual_brix, id],
  );
}

export function deleteBlendProduct(id: number): void {
  const product = queryOne<{ status: string }>('SELECT status FROM blend_products WHERE id = ?', [id]);
  if (product?.status === 'executed' || product?.status === 'bottled' || product?.status === 'blended') {
    throw new Error('Cannot delete an executed blend.');
  }
  runQuery('DELETE FROM blend_products WHERE id = ?', [id]);
}

// ── Reports & Dashboard ────────────────────────────────────

export function getProductionSummary(reportMonth?: string): ProductionSummary {
  const activeMashes = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM mash_batches WHERE status IN ('mashing', 'fermenting')",
  )?.count ?? 0;

  const activeFermentations = countActiveFermentations(queryAll<{
    equipment_id: number;
    volume_gal: number;
    status: string;
  }>(`
    SELECT a.floor_equipment_id as equipment_id, a.volume_gal, COALESCE(a.status, m.status) as status
    FROM mash_fermenter_assignments a
    JOIN mash_batches m ON m.id = a.mash_batch_id
    JOIN floor_equipment fe ON fe.id = a.floor_equipment_id
    WHERE fe.equipment_type = 'fermenter'
  `).map((row) => ({
    equipmentId: row.equipment_id,
    volumeGal: row.volume_gal,
    status: row.status,
  })));

  const activeRuns = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM distillation_runs WHERE status IN ('planned', 'running')",
  )?.count ?? 0;

  const barrelsAging = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM barrels WHERE status = 'aging'",
  )?.count ?? 0;

  const totalHeartsGal = reportMonth
    ? queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(c.volume_gal), 0) as total
       FROM distillation_cuts c
       JOIN distillation_runs r ON r.id = c.distillation_run_id
       WHERE c.cut_type = 'hearts' AND strftime('%Y-%m', r.run_date) = ?`,
      [reportMonth],
    )?.total ?? 0
    : queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(volume_gal), 0) as total FROM distillation_cuts WHERE cut_type = 'hearts'",
    )?.total ?? 0;

  const bottlesThisMonth = reportMonth
    ? queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(l.bottle_count), 0) as total
       FROM bottling_run_lines l
       JOIN bottling_runs r ON r.id = l.bottling_run_id
       WHERE strftime('%Y-%m', r.bottling_date) = ?`,
      [reportMonth],
    )?.total ?? queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(bottle_count), 0) as total FROM bottling_runs
       WHERE strftime('%Y-%m', bottling_date) = ?`,
      [reportMonth],
    )?.total ?? 0
    : queryOne<{ total: number }>(
      'SELECT COALESCE(SUM(l.bottle_count), 0) as total FROM bottling_run_lines l',
    )?.total ?? queryOne<{ total: number }>(
      'SELECT COALESCE(SUM(bottle_count), 0) as total FROM bottling_runs',
    )?.total ?? 0;

  const lowStockItems = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM inventory_items WHERE quantity <= reorder_level',
  )?.count ?? 0;

  return { activeMashes, activeFermentations, activeRuns, barrelsAging, totalHeartsGal, bottlesThisMonth, lowStockItems };
}

export function getYieldReports(reportMonth?: string): YieldReport[] {
  const monthClause = reportMonth
    ? "AND strftime('%Y-%m', r.run_date) = ?"
    : '';
  const params = reportMonth ? [reportMonth] : [];

  return queryAll<YieldReport>(`
    SELECT
      m.batch_number as mashBatchNumber,
      m.grain_lbs as grainLbs,
      m.water_gal as washVolumeGal,
      COALESCE(SUM(CASE WHEN c.cut_type = 'hearts' THEN c.volume_gal ELSE 0 END), 0) as heartsVolumeGal,
      COALESCE(AVG(CASE WHEN c.cut_type = 'hearts' THEN c.abv END), 0) as heartsAbv,
      COALESCE(SUM(CASE WHEN c.cut_type = 'hearts' THEN c.volume_gal * c.abv / 100 ELSE 0 END), 0) as gpa,
      CASE WHEN m.grain_lbs > 0
        THEN ROUND(COALESCE(SUM(CASE WHEN c.cut_type = 'hearts' THEN c.volume_gal * c.abv / 100 ELSE 0 END), 0) / m.grain_lbs * 100, 1)
        ELSE 0
      END as yieldPercent
    FROM mash_batches m
    INNER JOIN distillation_runs r ON r.source_mash_batch_id = m.id
    LEFT JOIN distillation_cuts c ON c.distillation_run_id = r.id
    WHERE 1=1 ${monthClause}
    GROUP BY m.id
    HAVING heartsVolumeGal > 0
    ORDER BY m.start_date DESC
  `, params);
}

export function getAllFloorEquipmentWithContext(): FloorEquipmentView[] {
  return getFloorPlans().flatMap((plan) => getFloorEquipmentWithContext(plan.id));
}

function collectionVesselContentsDetail(vesselId: number, volumeGal: number): string {
  if (!(volumeGal > 0.05)) return '';
  const stored = getCollectionVesselStoredCutType(vesselId);
  const stillageGal = queryOne<{ volume: number }>(`
    SELECT COALESCE(SUM(stillage_volume_gal), 0) as volume
    FROM distillation_runs
    WHERE stillage_holding_tank_equipment_id = ?
      AND status = 'complete'
      AND COALESCE(stillage_discarded, 0) = 0
      AND COALESCE(stillage_volume_gal, 0) > 0
  `, [vesselId])?.volume ?? 0;
  return collectionVesselContentsLabel({ volumeGal, stored, stillageGal })
    ?? getHoldingTankIntakeHistory(vesselId, 1)[0]?.summary
    ?? '';
}

export function getEquipmentVolumeReport(): EquipmentVolumeReport[] {
  const equipment = getAllFloorEquipmentWithContext();
  return equipment.map((eq) => {
    if (isSpiritLedgerEquipmentType(eq.equipment_type)) {
      const contents = getHoldingTankContents(eq.id);
      const detail = eq.equipment_type === 'collection_vessel'
        ? collectionVesselContentsDetail(eq.id, contents.volume_gal)
        : contents.run_count > 0
          ? `${contents.run_count} distillation run${contents.run_count === 1 ? '' : 's'} · ${contents.cut_count} cut${contents.cut_count === 1 ? '' : 's'}`
          : '';
      return {
        id: eq.id,
        name: eq.name,
        equipment_type: eq.equipment_type,
        status: eq.status,
        capacity_gal: eq.capacity_gal,
        volume_gal: contents.volume_gal,
        abv: contents.volume_gal > 0 ? contents.abv : null,
        detail,
      };
    }

    if (eq.equipment_type === 'fermenter') {
      return {
        id: eq.id,
        name: eq.name,
        equipment_type: eq.equipment_type,
        status: eq.status,
        capacity_gal: eq.capacity_gal,
        volume_gal: eq.active_volume_gal ?? 0,
        abv: null,
        detail: eq.active_batch_number ? `Wash ${eq.active_batch_number}` : '',
      };
    }

    if (eq.equipment_type === 'pot_still' || eq.equipment_type === 'column_still') {
      const running = queryOne<{ batch_number: string; charge_volume_gal: number; charge_abv: number | null; status: string; run_type: string; source_holding_tank_equipment_id: number | null }>(
        `SELECT batch_number, charge_volume_gal, charge_abv, status, run_type, source_holding_tank_equipment_id FROM distillation_runs
         WHERE still_name = ? AND status = 'running'
         ORDER BY run_date DESC LIMIT 1`,
        [eq.name],
      );
      const planned = running ? null : queryOne<{ batch_number: string; charge_volume_gal: number; charge_abv: number | null; status: string; run_type: string; source_holding_tank_equipment_id: number | null }>(
        `SELECT batch_number, charge_volume_gal, charge_abv, status, run_type, source_holding_tank_equipment_id FROM distillation_runs
         WHERE still_name = ? AND status = 'planned'
         ORDER BY run_date DESC LIMIT 1`,
        [eq.name],
      );
      const run = running ?? planned;
      let detail = running
        ? `Run ${running.batch_number} (running)`
        : planned
          ? `Planned ${planned.batch_number} (view only)`
          : '';
      if (
        run
        && isTankSourcedRun(run.run_type as DistillationRunType)
        && run.source_holding_tank_equipment_id
      ) {
        const tankName = queryOne<{ name: string }>(
          'SELECT name FROM floor_equipment WHERE id = ?',
          [run.source_holding_tank_equipment_id],
        )?.name;
        if (tankName) {
          const prefix = run.run_type === 'gin' ? 'Gin from' : 'Spirit from';
          detail = `${prefix} ${tankName} · ${detail}`;
        }
      }
      return {
        id: eq.id,
        name: eq.name,
        equipment_type: eq.equipment_type,
        status: eq.status,
        capacity_gal: eq.capacity_gal,
        volume_gal: running?.charge_volume_gal ?? 0,
        abv: running?.charge_abv ?? null,
        detail,
      };
    }

    return {
      id: eq.id,
      name: eq.name,
      equipment_type: eq.equipment_type,
      status: eq.status,
      capacity_gal: eq.capacity_gal,
      volume_gal: 0,
      abv: null,
      detail: '',
    };
  });
}

export function generateBatchNumber(prefix: 'W' | 'M' | 'D' | 'BT' | 'BL'): string {
  const year = new Date().getFullYear();
  const table = prefix === 'W' || prefix === 'M'
    ? 'mash_batches'
    : prefix === 'D'
      ? 'distillation_runs'
      : prefix === 'BL'
        ? 'blend_products'
        : 'bottling_runs';
  const count = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${table} WHERE batch_number LIKE ?`,
    [`${prefix}-${year}-%`],
  )?.count ?? 0;
  return `${prefix}-${year}-${String(count + 1).padStart(3, '0')}`;
}

// ── Floor Plan ─────────────────────────────────────────────

export function getFloorPlans(): FloorPlan[] {
  return queryAll<FloorPlan>('SELECT * FROM floor_plans ORDER BY id');
}

export function getFloorPlan(id?: number): FloorPlan {
  if (id != null) {
    return queryOne<FloorPlan>('SELECT * FROM floor_plans WHERE id = ?', [id])
      ?? getFloorPlans()[0]
      ?? { id: 1, name: 'Inside', width_ft: 160, height_ft: 120, notes: '' };
  }
  return getFloorPlans()[0]
    ?? { id: 1, name: 'Inside', width_ft: 160, height_ft: 120, notes: '' };
}

export function addFloorPlan(
  name: string,
  width_ft = 160,
  height_ft = 120,
): number {
  return insertRow(
    `INSERT INTO floor_plans (name, width_ft, height_ft, notes) VALUES (?, ?, ?, '')`,
    [name.trim(), width_ft, height_ft],
  );
}

export function saveFloorPlan(plan: Omit<FloorPlan, 'id'>, id = 1): void {
  runQuery(
    `UPDATE floor_plans SET name=?, width_ft=?, height_ft=?, notes=? WHERE id=?`,
    [plan.name, plan.width_ft, plan.height_ft, plan.notes, id],
  );
}

export function getFloorEquipment(planId = 1): FloorEquipment[] {
  syncFermenterAndStillStatuses();
  return queryAll<FloorEquipment>(
    'SELECT * FROM floor_equipment WHERE floor_plan_id = ? ORDER BY name',
    [planId],
  );
}

export function getFloorEquipmentWithContext(planId = 1): FloorEquipmentView[] {
  syncHoldingTankStatuses();
  const equipment = getFloorEquipment(planId);
  return equipment.map((eq) => {
    if (isSpiritLedgerEquipmentType(eq.equipment_type)) {
      const contents = getHoldingTankContents(eq.id);
      if (contents.volume_gal <= 0) return eq;
      return {
        ...eq,
        active_volume_gal: contents.volume_gal,
        active_abv: contents.abv,
        active_run_count: contents.run_count,
      };
    }
    if (eq.equipment_type === 'mash_tun' && eq.linked_mash_batch_id) {
      const wash = queryOne<{ batch_number: string; water_gal: number; status: string }>(
        'SELECT batch_number, water_gal, status FROM mash_batches WHERE id = ?',
        [eq.linked_mash_batch_id],
      );
      if (wash?.status === 'mashing') {
        return {
          ...eq,
          active_batch_number: wash.batch_number,
          active_volume_gal: wash.water_gal,
          active_mash_status: 'mashing',
        };
      }
    }
    if (eq.equipment_type !== 'fermenter') return eq;
    const info = queryOne<{
      mash_batch_id: number;
      batch_number: string;
      volume_gal: number;
      status: string;
      actual_brix: number | null;
      target_brix: number | null;
    }>(`
      SELECT m.id AS mash_batch_id, m.batch_number, a.volume_gal,
             COALESCE(a.status, m.status) as status, m.actual_brix, m.target_brix
      FROM mash_fermenter_assignments a
      JOIN mash_batches m ON m.id = a.mash_batch_id
      WHERE a.floor_equipment_id = ? AND a.volume_gal > 0.01
        AND COALESCE(a.status, 'fermenting') != 'discarded'
      LIMIT 1
    `, [eq.id]);
    if (!info || !fermenterShowsAssignedWash(info.status as MashStatus)) return eq;
    const logBrix = getLatestFermentationBrix(info.mash_batch_id, eq.id);
    const active_start_brix = info.actual_brix ?? info.target_brix ?? null;
    const active_latest_brix = logBrix ?? info.actual_brix ?? info.target_brix ?? null;
    return {
      ...eq,
      active_batch_number: info.batch_number,
      active_volume_gal: info.volume_gal,
      active_mash_status: info.status as FloorEquipmentView['active_mash_status'],
      active_start_brix,
      active_latest_brix,
    };
  });
}

export function getAllFloorEquipment(): FloorEquipment[] {
  return queryAll<FloorEquipment>(
    'SELECT * FROM floor_equipment ORDER BY equipment_type, name COLLATE NOCASE',
  );
}

export function getEquipmentMaintenanceLog(
  equipmentId: number,
  limit = 100,
): EquipmentMaintenanceLogView[] {
  return queryAll(
    `SELECT l.*, fe.name AS equipment_name
     FROM equipment_maintenance_log l
     JOIN floor_equipment fe ON fe.id = l.floor_equipment_id
     WHERE l.floor_equipment_id = ?
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT ?`,
    [equipmentId, limit],
  );
}

const EQUIPMENT_MAINTENANCE_LOG_SELECT = `SELECT l.*, fe.name AS equipment_name
     FROM equipment_maintenance_log l
     JOIN floor_equipment fe ON fe.id = l.floor_equipment_id
     ORDER BY l.created_at DESC, l.id DESC`;

export function getAllEquipmentMaintenanceLog(limit = 500): EquipmentMaintenanceLogView[] {
  return queryAll(
    `${EQUIPMENT_MAINTENANCE_LOG_SELECT}
     LIMIT ?`,
    [limit],
  );
}

/** Full maintenance and cleaning history for Reports. The working page keeps the latest 10. */
export function getEquipmentMaintenanceReportLog(): EquipmentMaintenanceLogView[] {
  return queryAll(EQUIPMENT_MAINTENANCE_LOG_SELECT);
}

export function updateEquipmentMaintenance(
  equipmentId: number,
  maintenance_status: EquipmentMaintenanceStatus | null,
  maintenance_notes: string,
  recordedByUserId: number,
  recordedByUserName: string,
): void {
  if (!recordedByUserId) {
    throw new Error('Select who recorded this maintenance action.');
  }
  runQuery(
    'UPDATE floor_equipment SET maintenance_status=?, maintenance_notes=? WHERE id=?',
    [maintenance_status, maintenance_notes.trim(), equipmentId],
  );
  appendEquipmentMaintenanceLog({
    floor_equipment_id: equipmentId,
    event_type: maintenance_status ? 'maintenance_set' : 'returned_to_service',
    maintenance_status,
    notes: maintenance_notes,
    recorded_by_user_id: recordedByUserId,
    recorded_by_user_name: recordedByUserName,
  });
}

export function getEquipmentTypeOptions(): { value: string; label: string; icon: string }[] {
  const custom = queryAll<{ name: string; icon: string | null }>(
    'SELECT name, icon FROM equipment_types ORDER BY name COLLATE NOCASE',
  );
  return [
    ...EQUIPMENT_TYPES.map((type) => ({ value: type.value, label: type.label, icon: type.value })),
    ...custom.map((row) => ({
      value: row.name,
      label: row.name,
      icon: resolveEquipmentIcon(row.icon, 'other'),
    })),
  ];
}

export function addEquipmentType(name: string, icon = 'other'): string {
  const normalized = normalizeEquipmentTypeName(name);
  const existing = queryAll<{ name: string }>('SELECT name FROM equipment_types');
  const error = equipmentTypeNameError(normalized, existing.map((row) => row.name));
  if (error) throw new Error(error);
  insertRow(
    'INSERT INTO equipment_types (name, icon) VALUES (?, ?)',
    [normalized, resolveEquipmentIcon(icon, 'other')],
  );
  return normalized;
}

export interface CustomEquipmentType {
  id: number;
  name: string;
  icon: string;
  equipment_count: number;
}

export function getCustomEquipmentTypes(): CustomEquipmentType[] {
  return queryAll<CustomEquipmentType>(`
    SELECT t.id, t.name, t.icon,
      (
        SELECT COUNT(*)
        FROM floor_equipment fe
        WHERE fe.equipment_type = t.name COLLATE NOCASE
      ) as equipment_count
    FROM equipment_types t
    ORDER BY t.name COLLATE NOCASE
  `);
}

export function deleteEquipmentType(name: string): void {
  const normalized = normalizeEquipmentTypeName(name);
  const row = queryOne<{ id: number; name: string }>(
    'SELECT id, name FROM equipment_types WHERE name = ? COLLATE NOCASE',
    [normalized],
  );
  if (!row) throw new Error('Equipment type not found.');
  const count = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM floor_equipment WHERE equipment_type = ? COLLATE NOCASE',
    [row.name],
  )?.count ?? 0;
  const error = equipmentTypeDeleteError(row.name, count);
  if (error) throw new Error(error);
  runQuery('DELETE FROM equipment_types WHERE id = ?', [row.id]);
}

export function saveFloorEquipment(
  item: Omit<FloorEquipment, 'id' | 'created_at'>,
  id?: number,
): void {
  const maintenanceStatus = item.maintenance_status ?? null;
  const maintenanceNotes = item.maintenance_notes ?? '';
  const icon = resolveEquipmentIcon(item.icon, item.equipment_type);
  if (id) {
    runQuery(
      `UPDATE floor_equipment SET floor_plan_id=?, name=?, equipment_type=?, icon=?, pos_x_ft=?, pos_y_ft=?, width_ft=?, depth_ft=?, capacity_gal=?, status=?, linked_mash_batch_id=?, notes=?, maintenance_status=?, maintenance_notes=? WHERE id=?`,
      [item.floor_plan_id, item.name, item.equipment_type, icon, item.pos_x_ft, item.pos_y_ft, item.width_ft, item.depth_ft, item.capacity_gal, item.status, item.linked_mash_batch_id, item.notes, maintenanceStatus, maintenanceNotes, id],
    );
  } else {
    insertRow(
      `INSERT INTO floor_equipment (floor_plan_id, name, equipment_type, icon, pos_x_ft, pos_y_ft, width_ft, depth_ft, capacity_gal, status, linked_mash_batch_id, notes, maintenance_status, maintenance_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.floor_plan_id, item.name, item.equipment_type, icon, item.pos_x_ft, item.pos_y_ft, item.width_ft, item.depth_ft, item.capacity_gal, item.status, item.linked_mash_batch_id, item.notes, maintenanceStatus, maintenanceNotes],
    );
  }
}

export function updateEquipmentPosition(id: number, pos_x_ft: number, pos_y_ft: number): void {
  runQuery('UPDATE floor_equipment SET pos_x_ft=?, pos_y_ft=? WHERE id=?', [pos_x_ft, pos_y_ft, id]);
}

export function updateEquipmentProcessPosition(id: number, process_pos_x: number, process_pos_y: number): void {
  runQuery(
    'UPDATE floor_equipment SET process_pos_x=?, process_pos_y=? WHERE id=?',
    [process_pos_x, process_pos_y, id],
  );
}

export function moveEquipmentToPlan(
  equipmentId: number,
  planId: number,
  pos_x_ft = 4,
  pos_y_ft = 4,
): void {
  runQuery(
    'UPDATE floor_equipment SET floor_plan_id=?, pos_x_ft=?, pos_y_ft=? WHERE id=?',
    [planId, pos_x_ft, pos_y_ft, equipmentId],
  );
}

export function deleteFloorEquipment(id: number): void {
  runQuery('DELETE FROM floor_equipment WHERE id = ?', [id]);
}
