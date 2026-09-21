import { useCallback, useEffect, useState } from 'react';
import { BARREL_STOCK_CATEGORY, BARREL_STOCK_ITEM_NAME } from '../lib/barrel-inventory';
import {
  additionalPackagingNeeded,
  packagingBottleCountsBySku,
  packagingInventoryAdjustments,
} from '../lib/bottling-lines';
import { isFermenterSourcedRun, isTankSourcedRun, runUsesDestHoldingTank } from '../lib/distillation-run-types';
import { chargeExceedsStillCapacity, stillChargeCapacityMessage } from '../lib/still-charge';
import {
  equipmentBlocksProduction,
  maintenanceStatusLabel,
} from '../lib/equipment-maintenance';
import { fermenterShowsAssignedWash } from '../lib/mash-fermenter-fill';
import type { EquipmentMaintenanceStatus } from '../types';
import { initDatabase, clearAllData } from './database';
import type {
  Barrel,
  BarrelFill,
  BlendFormulaVersion,
  BlendIngredient,
  BlendIngredientInput,
  BlendProduct,
  BlendProductView,
  BlendRecipe,
  BlendRecipeIngredient,
  BlendRecipeSpiritSource,
  BlendRecipeSpiritSourceInput,
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
  HoldingTankTransfer,
  HoldingTankTransferView,
  DistillationRun,
  DistillationRunType,
  DistillationRunView,
  FermentationLog,
  FermentationLogView,
  MashFermenterAssignment,
  FloorEquipment,
  FloorEquipmentView,
  FloorPlan,
  InventoryItem,
  MashBatch,
  MashStatus,
  Recipe,
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
  reconcileMeasurements,
  type AdditiveInput,
  type SpiritSourceInput,
} from '../lib/blend-formulation';

/** Statuses that draw spirit from holding tanks (formula saves do not). */
const BLEND_LEDGER_STATUSES_SQL = "('executed', 'bottled', 'blended')";

function onlyProductionUsable<T extends FloorEquipment>(items: T[]): T[] {
  return items.filter((e) => !equipmentBlocksProduction(e));
}

function assertEquipmentUsableForProduction(equipmentId: number, role = 'Equipment'): void {
  const eq = queryOne<FloorEquipment>('SELECT * FROM floor_equipment WHERE id = ?', [equipmentId]);
  if (!eq) throw new Error(`${role} not found.`);
  if (equipmentBlocksProduction(eq)) {
    throw new Error(
      `${eq.name} is ${maintenanceStatusLabel(eq.maintenance_status).toLowerCase()} and cannot be used until returned to service.`,
    );
  }
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
) {
  const theoretical = computeTheoreticalBlend(toSpiritInputs(spiritSources), toAdditiveInputs(ingredients));
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
  if (item.quantity + 1e-9 < 1) {
    throw new Error(
      `Not enough empty barrels in inventory (${item.name}: ${item.quantity} on hand). Receive barrels on Inventory before adding a new barrel.`,
    );
  }
  adjustInventory(item.id, -1);
}

function assertPackagingInventoryAvailable(needBySku: Record<string, number>): void {
  for (const [name, need] of Object.entries(needBySku)) {
    if (need <= 0) continue;
    const item = findInventoryItem('packaging', name);
    if (!item) continue;
    if (item.quantity + 1e-9 < need) {
      throw new Error(
        `Not enough ${name} in packaging inventory (on hand ${item.quantity}, need ${need} more for this bottling run).`,
      );
    }
  }
}

function syncBottlingPackagingInventory(
  previousLines: BottlingRunLineInput[],
  nextLines: BottlingRunLineInput[],
): void {
  const prev = packagingBottleCountsBySku(previousLines);
  const next = packagingBottleCountsBySku(nextLines);
  assertPackagingInventoryAvailable(additionalPackagingNeeded(prev, next));
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
  if (id) {
    runQuery(
      `UPDATE inventory_items SET name=?, category=?, unit=?, quantity=?, reorder_level=?, notes=?, updated_at=datetime('now') WHERE id=?`,
      [item.name, item.category, item.unit, item.quantity, item.reorder_level, item.notes, id],
    );
  } else {
    insertRow(
      `INSERT INTO inventory_items (name, category, unit, quantity, reorder_level, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [item.name, item.category, item.unit, item.quantity, item.reorder_level, item.notes],
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

export function getRecipes(): Recipe[] {
  return queryAll<Recipe>('SELECT * FROM recipes ORDER BY name');
}

export function getRecipe(id: number): Recipe | undefined {
  return queryOne<Recipe>('SELECT * FROM recipes WHERE id = ?', [id]) ?? undefined;
}

export function saveRecipe(
  recipe: Omit<Recipe, 'id' | 'created_at' | 'updated_at'>,
  id?: number,
): void {
  if (id) {
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
        id,
      ],
    );
  } else {
    insertRow(
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
}

export function deleteRecipe(id: number): void {
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
}

export interface FermenterAssignmentInput {
  equipmentId: number;
  volumeGal: number;
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
      AND m.status NOT IN ('complete', 'discarded')
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

/** Fermenters in use with fermenting wash — source picker for low wine and heavy rum runs. */
export function getFermenterWashSourceFermenters(
  excludeRunId?: number,
): FermenterWashSourceOption[] {
  const rows = queryAll<{
    id: number;
    mash_batch_id: number;
    floor_equipment_id: number;
    volume_gal: number;
    equipment_name: string;
    batch_number: string;
    recipe_name: string;
  }>(`
    SELECT a.id, a.mash_batch_id, a.floor_equipment_id, a.volume_gal,
           fe.name as equipment_name, m.batch_number, m.recipe_name
    FROM mash_fermenter_assignments a
    JOIN mash_batches m ON m.id = a.mash_batch_id
    JOIN floor_equipment fe ON fe.id = a.floor_equipment_id
    WHERE a.volume_gal > 0.01
      AND m.status = 'fermenting'
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
    const washRunUsingFermenter = queryOne<{ id: number }>(
      `SELECT id FROM distillation_runs
       WHERE source_mash_batch_id = ?
         AND source_fermenter_equipment_id = ?
         AND run_type = 'wash'
         AND status IN ('planned', 'running', 'complete')
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

export function getPotStills(): FloorEquipment[] {
  return onlyProductionUsable(getFloorEquipment().filter(
    (e) => e.equipment_type === 'pot_still' || e.equipment_type === 'column_still',
  ));
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

export function getHoldingTanks(): FloorEquipment[] {
  syncHoldingTankStatuses();
  return onlyProductionUsable(getFloorEquipment().filter((e) => e.equipment_type === 'holding_tank'));
}

export function getCollectionVessels(): FloorEquipment[] {
  syncHoldingTankStatuses();
  return onlyProductionUsable(getFloorEquipment().filter((e) => e.equipment_type === 'collection_vessel'));
}

/** Cut type already stored in a collection vessel (from distillation cuts with volume). */
export function getCollectionVesselStoredCutType(
  vesselId: number,
  excludeCutId?: number,
): CutType | null {
  const row = queryOne<{ cut_type: CutType }>(
    `SELECT cut_type FROM distillation_cuts
     WHERE holding_tank_equipment_id = ?
       AND volume_gal > 0
       AND (? IS NULL OR id != ?)
     LIMIT 1`,
    [vesselId, excludeCutId ?? null, excludeCutId ?? 0],
  );
  return row?.cut_type ?? null;
}

export function collectionVesselAcceptsCutType(
  vesselId: number,
  cutType: CutType,
  excludeCutId?: number,
): boolean {
  const stored = getCollectionVesselStoredCutType(vesselId, excludeCutId);
  return stored == null || stored === cutType;
}

/** Collection vessels that are empty or already hold this cut type only. */
export function getCollectionVesselsForCutType(
  cutType: CutType,
  excludeCutId?: number,
): FloorEquipment[] {
  return getCollectionVessels().filter((v) =>
    collectionVesselAcceptsCutType(v.id, cutType, excludeCutId),
  );
}

/** Holding tanks and collection vessels — equipment that uses the spirit ledger for transfers. */
export function getSpiritTransferVessels(): FloorEquipment[] {
  syncHoldingTankStatuses();
  return onlyProductionUsable(getFloorEquipment().filter(
    (e) => e.equipment_type === 'holding_tank' || e.equipment_type === 'collection_vessel',
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
  if (row.equipment_type !== 'holding_tank' && row.equipment_type !== 'collection_vessel') {
    throw new Error(`${row.name} cannot be used for spirit transfers — choose a holding tank or collection vessel.`);
  }
}

export function getHoldingTankContents(
  tankId: number,
  excludeRunId?: number,
  excludeBlendId?: number,
  excludeBottlingRunId?: number,
): HoldingTankContents {
  const ins = queryOne<{ volume_gal: number; gpa: number; run_count: number; cut_count: number }>(`
    SELECT
      COALESCE(SUM(volume_gal), 0) as volume_gal,
      COALESCE(SUM(volume_gal * abv / 100), 0) as gpa,
      COUNT(DISTINCT distillation_run_id) as run_count,
      COUNT(*) as cut_count
    FROM distillation_cuts
    WHERE holding_tank_equipment_id = ?
  `, [tankId]);

  const runOuts = queryOne<{ volume_gal: number; gpa: number }>(`
    SELECT
      COALESCE(SUM(charge_volume_gal), 0) as volume_gal,
      COALESCE(SUM(charge_volume_gal * COALESCE(charge_abv, 0) / 100), 0) as gpa
    FROM distillation_runs
    WHERE source_holding_tank_equipment_id = ?
      AND status IN ('planned', 'running', 'complete')
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

  const volumeIn = (ins?.volume_gal ?? 0) + (transferIns?.volume_gal ?? 0) + (blendIns?.volume_gal ?? 0);
  const volumeOut = (runOuts?.volume_gal ?? 0) + (blendOuts?.volume_gal ?? 0)
    + (bottlingOuts?.volume_gal ?? 0) + (barrelFillOuts?.volume_gal ?? 0) + (transferOuts?.volume_gal ?? 0);
  const gpaIn = (ins?.gpa ?? 0) + (transferIns?.gpa ?? 0) + (blendIns?.gpa ?? 0);
  const gpaOut = (runOuts?.gpa ?? 0) + (blendOuts?.gpa ?? 0)
    + (bottlingOuts?.gpa ?? 0) + (barrelFillOuts?.gpa ?? 0) + (transferOuts?.gpa ?? 0);
  const volume_gal = Math.max(0, volumeIn - volumeOut);
  const gpaRemaining = Math.max(0, gpaIn - gpaOut);
  const abv = volume_gal > 0 ? (gpaRemaining / volume_gal) * 100 : 0;

  return {
    volume_gal,
    abv,
    run_count: ins?.run_count ?? 0,
    cut_count: ins?.cut_count ?? 0,
  };
}

export function getChargeableHoldingTanks(excludeRunId?: number): (FloorEquipment & {
  available_gal: number;
  available_abv: number;
})[] {
  return getHoldingTanks()
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

export function getHighWinesDestinationTanks(excludeTankId?: number | null): FloorEquipment[] {
  return getHoldingTanks().filter((t) => t.id !== excludeTankId);
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

export function defaultHeavyRumTankId(excludeTankId?: number | null): number | null {
  const tanks = getHighWinesDestinationTanks(excludeTankId);
  const preferred = tanks.find((t) => t.name.toLowerCase().includes('heavy rum'));
  return preferred?.id ?? findTankByKeywords(['heavy rum', 'heavy'], excludeTankId) ?? tanks[0]?.id ?? null;
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
  if (runType === 'heavy_rum') return defaultHeavyRumTankId(excludeTankId);
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
      if (
        run?.dest_holding_tank_equipment_id
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
    occurred_at: string;
    cut_type: string;
    volume_gal: number;
    abv: number;
    batch_number: string;
    run_type: string;
    still_name: string;
    mash_batch: string | null;
  }>(`
    SELECT
      c.id,
      c.start_time as occurred_at,
      c.cut_type,
      c.volume_gal,
      c.abv,
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
    spirit_type: string;
    source_tank_name: string;
  }>(`
    SELECT
      t.id,
      COALESCE(t.created_at, t.transfer_date) as occurred_at,
      t.volume_gal,
      t.abv,
      t.spirit_type,
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
  }>(`
    SELECT
      id,
      COALESCE(executed_at, created_at) as occurred_at,
      final_volume_gal as volume_gal,
      final_abv as abv,
      batch_number,
      product_name
    FROM blend_products
    WHERE output_holding_tank_equipment_id = ?
      AND status IN ${BLEND_LEDGER_STATUSES_SQL}
      AND final_volume_gal > 0
  `, [tankId]);

  const runTypeLabels: Record<string, string> = {
    wash: 'low wine run',
    low_wines: 'spirit run',
    heavy_rum: 'heavy rum run',
  };

  const spiritLabels: Record<string, string> = {
    low_wines: 'low wines',
    high_wines: 'high wines',
  };

  const entries: HoldingTankIntakeEntry[] = [
    ...cuts.map((c) => {
      const cutLabel = c.cut_type.charAt(0).toUpperCase() + c.cut_type.slice(1);
      const runLabel = runTypeLabels[c.run_type] ?? c.run_type;
      const detailParts = [c.still_name, c.mash_batch ? `wash ${c.mash_batch}` : null].filter(Boolean);
      return {
        kind: 'cut' as const,
        id: c.id,
        occurred_at: c.occurred_at,
        volume_gal: c.volume_gal,
        abv: c.abv,
        summary: `${cutLabel} from ${c.batch_number} (${runLabel})`,
        detail: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
      };
    }),
    ...transfers.map((t) => ({
      kind: 'transfer' as const,
      id: t.id,
      occurred_at: t.occurred_at,
      volume_gal: t.volume_gal,
      abv: t.abv,
      summary: `Transfer from ${t.source_tank_name}`,
      detail: spiritLabels[t.spirit_type] ?? t.spirit_type.replace('_', ' '),
    })),
    ...blends.map((b) => ({
      kind: 'blend' as const,
      id: b.id,
      occurred_at: b.occurred_at,
      volume_gal: b.volume_gal,
      abv: b.abv,
      summary: `Blend ${b.batch_number} — ${b.product_name}`,
      detail: 'Finished batch',
    })),
  ];

  entries.sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  return entries.slice(0, limit);
}

export function getHoldingTankTransfers(): HoldingTankTransferView[] {
  return queryAll(
    `SELECT t.*,
            src.name as source_tank_name,
            dest.name as dest_tank_name
     FROM holding_tank_transfers t
     JOIN floor_equipment src ON src.id = t.source_tank_equipment_id
     JOIN floor_equipment dest ON dest.id = t.dest_tank_equipment_id
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
  transfer: Omit<HoldingTankTransfer, 'id' | 'created_at'>,
): void {
  if (transfer.source_tank_equipment_id === transfer.dest_tank_equipment_id) {
    throw new Error('Source and destination tanks must be different.');
  }
  if (transfer.volume_gal <= 0) {
    throw new Error('Transfer volume must be greater than zero.');
  }
  assertSpiritTransferVessel(transfer.source_tank_equipment_id, 'source');
  assertSpiritTransferVessel(transfer.dest_tank_equipment_id, 'destination');
  assertEquipmentUsableForProduction(transfer.source_tank_equipment_id, 'Source tank');
  assertEquipmentUsableForProduction(transfer.dest_tank_equipment_id, 'Destination tank');
  const available = getHoldingTankContents(transfer.source_tank_equipment_id);
  if (transfer.volume_gal > available.volume_gal + 0.01) {
    throw new Error(`Only ${available.volume_gal.toFixed(1)} gal available in the source tank.`);
  }
  insertRow(
    `INSERT INTO holding_tank_transfers
      (spirit_type, source_tank_equipment_id, dest_tank_equipment_id, volume_gal, abv, transfer_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      transfer.spirit_type,
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
    SET charge_volume_gal = 0, charge_abv = NULL
    WHERE source_holding_tank_equipment_id IS NOT NULL AND charge_volume_gal > 0
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
    "SELECT * FROM floor_equipment WHERE equipment_type IN ('holding_tank', 'collection_vessel')",
  );
  for (const tank of tanks) {
    const contents = getHoldingTankContents(tank.id);
    if (contents.volume_gal > 0) {
      runQuery(`UPDATE floor_equipment SET status='in_use' WHERE id=?`, [tank.id]);
    } else if (tank.status === 'in_use') {
      runQuery(`UPDATE floor_equipment SET status='empty' WHERE id=?`, [tank.id]);
    }
  }
}

export function syncFermenterAndStillStatuses(): void {
  const fermenters = queryAll<FloorEquipment>(
    "SELECT * FROM floor_equipment WHERE equipment_type = 'fermenter'",
  );
  for (const f of fermenters) {
    const row = queryOne<{ mash_batch_id: number; status: string }>(`
      SELECT a.mash_batch_id, m.status
      FROM mash_fermenter_assignments a
      JOIN mash_batches m ON m.id = a.mash_batch_id
      WHERE a.floor_equipment_id = ?
      LIMIT 1
    `, [f.id]);

    const shouldBeInUse = !!row && fermenterShowsAssignedWash(row.status as MashStatus);

    if (shouldBeInUse) {
      runQuery(
        `UPDATE floor_equipment SET status='in_use', linked_mash_batch_id=? WHERE id=?`,
        [row.mash_batch_id, f.id],
      );
    } else if (f.status === 'in_use') {
      runQuery(
        `UPDATE floor_equipment SET status='empty', linked_mash_batch_id=NULL WHERE id=?`,
        [f.id],
      );
    }
  }

  const stills = queryAll<FloorEquipment>(
    "SELECT * FROM floor_equipment WHERE equipment_type IN ('pot_still', 'column_still')",
  );
  for (const s of stills) {
    if (s.status === 'offline') continue;
    const activeRun = queryOne<{ id: number }>(
      "SELECT id FROM distillation_runs WHERE still_name = ? AND status IN ('running', 'planned') LIMIT 1",
      [s.name],
    );
    if (activeRun) {
      runQuery(`UPDATE floor_equipment SET status='in_use' WHERE id=?`, [s.id]);
    } else if (s.status === 'in_use') {
      runQuery(`UPDATE floor_equipment SET status='empty' WHERE id=?`, [s.id]);
    }
  }
}

export function saveMashFermenterAssignments(
  mashBatchId: number,
  assignments: FermenterAssignmentInput[],
): void {
  runQuery('DELETE FROM mash_fermenter_assignments WHERE mash_batch_id = ?', [mashBatchId]);
  for (const a of assignments) {
    if (a.equipmentId <= 0) continue;
    assertEquipmentUsableForProduction(a.equipmentId, 'Fermenter');
    insertRow(
      `INSERT INTO mash_fermenter_assignments (mash_batch_id, floor_equipment_id, volume_gal) VALUES (?, ?, ?)`,
      [mashBatchId, a.equipmentId, a.volumeGal],
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

function releaseWashTankForMashBatch(mashBatchId: number): void {
  runQuery(
    `UPDATE floor_equipment SET status='empty', linked_mash_batch_id=NULL
     WHERE equipment_type='mash_tun' AND linked_mash_batch_id=?`,
    [mashBatchId],
  );
}

function syncWashTankForMashBatch(mashBatchId: number, status: MashStatus): void {
  releaseWashTankForMashBatch(mashBatchId);
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
  for (const a of assignments) {
    if (a.equipmentId <= 0) continue;
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
  id?: number,
): number {
  const previous = id ? getMashBatch(id) : undefined;
  assertMashBatchEquipmentUsable(batch, assignments);
  const mashId = saveMashBatch(batch, id);
  try {
    saveMashFermenterAssignments(mashId, assignments);
    applyMashInventoryUsage(batch, previous);
    syncWashTankForMashBatch(mashId, batch.status);
  } catch (err) {
    if (!id) {
      runQuery('DELETE FROM mash_batches WHERE id = ?', [mashId]);
    }
    throw err;
  }
  return mashId;
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
  runQuery(
    `UPDATE floor_equipment SET status='empty', linked_mash_batch_id=NULL WHERE id=?`,
    [equipmentId],
  );
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

function chargeFermenterForDistillation(
  mashBatchId: number,
  equipmentId: number,
  runType: DistillationRunType,
  chargeVolumeGal: number,
  runId?: number,
): void {
  if (runType === 'heavy_rum') {
    chargeHeavyRumFromFermenter(mashBatchId, equipmentId, chargeVolumeGal, runId);
    maybeCompleteMashAfterCharge(mashBatchId);
    return;
  }
  releaseFermenterForMash(mashBatchId, equipmentId);
  maybeCompleteMashAfterCharge(mashBatchId);
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
  if (!batch || batch.status !== 'fermenting') {
    throw new Error('Fermentation logs can only be added while batch status is fermenting.');
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
       dest.name as dest_holding_tank_name
     FROM distillation_runs r
     LEFT JOIN floor_equipment src ON src.id = r.source_holding_tank_equipment_id
     LEFT JOIN floor_equipment dest ON dest.id = r.dest_holding_tank_equipment_id
     ORDER BY r.run_date DESC`,
  );
}

export function saveDistillationRun(run: Omit<DistillationRun, 'id' | 'created_at'>, id?: number): void {
  const runType = (run.run_type ?? 'wash') as DistillationRunType;
  assertStillUsableByName(run.still_name);
  if (isFermenterSourcedRun(runType) && run.source_fermenter_equipment_id) {
    assertEquipmentUsableForProduction(run.source_fermenter_equipment_id, 'Fermenter');
  }
  if (isTankSourcedRun(runType) && run.source_holding_tank_equipment_id) {
    assertEquipmentUsableForProduction(run.source_holding_tank_equipment_id, 'Source tank');
  }
  if (runUsesDestHoldingTank(runType) && run.dest_holding_tank_equipment_id) {
    assertEquipmentUsableForProduction(run.dest_holding_tank_equipment_id, 'Destination tank');
  }
  const stillCapacity = getStillCapacityByName(run.still_name);
  if (chargeExceedsStillCapacity(run.charge_volume_gal, stillCapacity)) {
    throw new Error(
      stillChargeCapacityMessage(run.charge_volume_gal, run.still_name, stillCapacity!),
    );
  }
  if (id) {
    runQuery(
      `UPDATE distillation_runs SET batch_number=?, run_type=?, source_mash_batch_id=?, source_fermenter_equipment_id=?, source_holding_tank_equipment_id=?, dest_holding_tank_equipment_id=?, still_name=?, run_date=?, charge_volume_gal=?, charge_abv=?, status=?, assigned_user_id=?, assigned_user_name=?, notes=? WHERE id=?`,
      [
        run.batch_number,
        runType,
        isFermenterSourcedRun(runType) ? run.source_mash_batch_id : null,
        isFermenterSourcedRun(runType) ? run.source_fermenter_equipment_id : null,
        isTankSourcedRun(runType) ? run.source_holding_tank_equipment_id : null,
        runUsesDestHoldingTank(runType) ? run.dest_holding_tank_equipment_id : null,
        run.still_name,
        run.run_date,
        run.charge_volume_gal,
        isTankSourcedRun(runType) ? run.charge_abv : null,
        run.status,
        run.assigned_user_id,
        run.assigned_user_name ?? '',
        run.notes,
        id,
      ],
    );
  } else {
    insertRow(
      `INSERT INTO distillation_runs (batch_number, run_type, source_mash_batch_id, source_fermenter_equipment_id, source_holding_tank_equipment_id, dest_holding_tank_equipment_id, still_name, run_date, charge_volume_gal, charge_abv, status, assigned_user_id, assigned_user_name, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.batch_number,
        runType,
        isFermenterSourcedRun(runType) ? run.source_mash_batch_id : null,
        isFermenterSourcedRun(runType) ? run.source_fermenter_equipment_id : null,
        isTankSourcedRun(runType) ? run.source_holding_tank_equipment_id : null,
        runUsesDestHoldingTank(runType) ? run.dest_holding_tank_equipment_id : null,
        run.still_name,
        run.run_date,
        run.charge_volume_gal,
        isTankSourcedRun(runType) ? run.charge_abv : null,
        run.status,
        run.assigned_user_id,
        run.assigned_user_name ?? '',
        run.notes,
      ],
    );
  }

  if (isFermenterSourcedRun(runType) && run.source_mash_batch_id && run.source_fermenter_equipment_id) {
    chargeFermenterForDistillation(
      run.source_mash_batch_id,
      run.source_fermenter_equipment_id,
      runType,
      run.charge_volume_gal,
      id,
    );
  } else if (isFermenterSourcedRun(runType) && run.source_mash_batch_id && (run.status === 'running' || run.status === 'complete')) {
    releaseFermentersForMash(run.source_mash_batch_id);
    maybeCompleteMashAfterCharge(run.source_mash_batch_id);
  }

  syncHoldingTankStatuses();
  syncFermenterAndStillStatuses();
}

export function deleteDistillationRun(id: number): void {
  const run = queryOne<DistillationRun>('SELECT * FROM distillation_runs WHERE id = ?', [id]);
  if (
    run
    && run.run_type === 'heavy_rum'
    && run.source_mash_batch_id
    && run.source_fermenter_equipment_id
    && run.charge_volume_gal > 0
  ) {
    restoreHeavyRumChargeToFermenter(
      run.source_mash_batch_id,
      run.source_fermenter_equipment_id,
      run.charge_volume_gal,
    );
  }
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
    if (!isCollectionVesselEquipmentId(cut.holding_tank_equipment_id)) {
      throw new Error('Distillation cuts must be collected into a collection vessel (or leave heads empty to discard).');
    }
    assertEquipmentUsableForProduction(cut.holding_tank_equipment_id, 'Collection vessel');
    if (!collectionVesselAcceptsCutType(cut.holding_tank_equipment_id, cut.cut_type, id)) {
      const stored = getCollectionVesselStoredCutType(cut.holding_tank_equipment_id, id);
      throw new Error(
        stored
          ? `This collection vessel already contains ${stored} cuts. Choose another vessel for ${cut.cut_type}.`
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
  runQuery('DELETE FROM distillation_cuts WHERE id = ?', [id]);
  syncHoldingTankStatuses();
}

// ── Barrels ────────────────────────────────────────────────

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
        barrel.warehouse_location,
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
      barrel.warehouse_location,
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

function attachBlendRecipeDetails(recipes: BlendRecipe[]): BlendRecipeView[] {
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
    spirit_sources: spiritsByRecipe.get(recipe.id) ?? [],
    ingredients: ingredientsByRecipe.get(recipe.id) ?? [],
  }));
}

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
          blend_recipe_id, ingredient_type, name, amount, unit, cost_per_unit, lot_number, inventory_item_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recipeId,
          ingredient.ingredient_type,
          ingredient.name,
          ingredient.amount,
          ingredient.unit,
          ingredient.cost_per_unit ?? null,
          ingredient.lot_number ?? '',
          ingredient.inventory_item_id ?? null,
          ingredient.notes,
        ],
      );
    });
}

export function getBlendRecipes(): BlendRecipeView[] {
  const recipes = queryAll<BlendRecipe>('SELECT * FROM blend_recipes ORDER BY name');
  return attachBlendRecipeDetails(recipes);
}

export function getBlendRecipe(id: number): BlendRecipeView | undefined {
  const recipe = queryOne<BlendRecipe>('SELECT * FROM blend_recipes WHERE id = ?', [id]);
  if (!recipe) return undefined;
  return attachBlendRecipeDetails([recipe])[0];
}

export function saveBlendRecipe(
  recipe: Omit<BlendRecipe, 'id' | 'created_at' | 'updated_at'>,
  spiritSources: BlendRecipeSpiritSourceInput[],
  ingredients: BlendIngredientInput[],
  id?: number,
): number {
  if (!recipe.name.trim()) throw new Error('Recipe name is required.');

  const sourceType = recipe.source_type ?? 'tank';

  if (id) {
    runQuery(
      `UPDATE blend_recipes SET
        name = ?, product_name = ?, target_abv = ?, target_brix = ?, scale_factor = ?, source_type = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        recipe.name.trim(),
        recipe.product_name,
        recipe.target_abv,
        recipe.target_brix,
        recipe.scale_factor ?? 1,
        sourceType,
        recipe.notes,
        id,
      ],
    );
  } else {
    id = insertRow(
      `INSERT INTO blend_recipes (name, product_name, target_abv, target_brix, scale_factor, source_type, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        recipe.name.trim(),
        recipe.product_name,
        recipe.target_abv,
        recipe.target_brix,
        recipe.scale_factor ?? 1,
        sourceType,
        recipe.notes,
      ],
    );
  }

  persistBlendRecipeSpiritSources(id, spiritSources);
  persistBlendRecipeIngredients(id, ingredients);
  return id;
}

export function deleteBlendRecipe(id: number): void {
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
    `SELECT b.*, fe.name as source_tank_name, out_fe.name as output_tank_name, br.name as blend_recipe_name
     FROM blend_products b
     JOIN floor_equipment fe ON fe.id = b.source_holding_tank_equipment_id
     LEFT JOIN floor_equipment out_fe ON out_fe.id = b.output_holding_tank_equipment_id
     LEFT JOIN blend_recipes br ON br.id = b.blend_recipe_id
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
       (blend_product_id, ingredient_type, name, amount, unit, cost_per_unit, lot_number, inventory_item_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        blendProductId,
        ing.ingredient_type,
        ing.name,
        ing.amount,
        ing.unit,
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
        actual_volume_gal=?, actual_weight_lbs=?, actual_abv=?, actual_density=?, actual_brix=?, status=?, output_holding_tank_equipment_id=?, blend_recipe_id=?, assigned_user_id=?, assigned_user_name=?, notes=?
       WHERE id=?`,
      [
        row.batch_number, row.product_name, row.source_holding_tank_equipment_id,
        row.base_spirit_volume_gal, row.base_spirit_abv, row.blend_date,
        row.target_abv, row.target_brix, row.scale_factor, row.formula_version, row.formulation_phase,
        row.final_volume_gal, row.final_abv,
        row.theoretical_volume_gal, row.theoretical_abv, row.theoretical_density, row.theoretical_brix,
        row.actual_volume_gal, row.actual_weight_lbs, row.actual_abv, row.actual_density, row.actual_brix,
        row.status, row.output_holding_tank_equipment_id, row.blend_recipe_id, row.assigned_user_id, row.assigned_user_name, row.notes, id,
      ],
    );
  } else {
    id = insertRow(
      `INSERT INTO blend_products (
        batch_number, product_name, source_holding_tank_equipment_id, base_spirit_volume_gal, base_spirit_abv,
        blend_date, target_abv, target_brix, scale_factor, formula_version, formulation_phase,
        final_volume_gal, final_abv, theoretical_volume_gal, theoretical_abv, theoretical_density, theoretical_brix,
        actual_volume_gal, actual_weight_lbs, actual_abv, actual_density, actual_brix, status, output_holding_tank_equipment_id, blend_recipe_id, assigned_user_id, assigned_user_name, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.batch_number, row.product_name, row.source_holding_tank_equipment_id,
        row.base_spirit_volume_gal, row.base_spirit_abv, row.blend_date,
        row.target_abv, row.target_brix, row.scale_factor, row.formula_version, row.formulation_phase,
        row.final_volume_gal, row.final_abv,
        row.theoretical_volume_gal, row.theoretical_abv, row.theoretical_density, row.theoretical_brix,
        row.actual_volume_gal, row.actual_weight_lbs, row.actual_abv, row.actual_density, row.actual_brix,
        row.status, row.output_holding_tank_equipment_id, row.blend_recipe_id, row.assigned_user_id, row.assigned_user_name, row.notes,
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

  const ingredients = getBlendIngredients(id);
  for (const ing of ingredients) {
    if (ing.inventory_item_id && ing.amount > 0) {
      const item = queryOne<{ quantity: number; unit: string; name: string }>(
        'SELECT quantity, unit, name FROM inventory_items WHERE id = ?',
        [ing.inventory_item_id],
      );
      if (!item) throw new Error(`Inventory item for ${ing.name} not found.`);
      if (item.quantity < ing.amount - 0.001) {
        throw new Error(`Insufficient ${item.name}: need ${ing.amount} ${ing.unit}, have ${item.quantity}.`);
      }
      adjustInventory(ing.inventory_item_id, -ing.amount);
    }
  }

  const formulation = computeBlendFormulation(sources, ingredients.map((i) => ({
    ingredient_type: i.ingredient_type,
    name: i.name,
    amount: i.amount,
    unit: i.unit,
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

  syncHoldingTankStatuses();
}

/**
 * Reverse an executed blend (admin). Restores inventory and barrel pulls and removes
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
  for (const ing of ingredients) {
    if (ing.inventory_item_id && ing.amount > 0) {
      adjustInventory(ing.inventory_item_id, ing.amount);
    }
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

  return { activeMashes, activeRuns, barrelsAging, totalHeartsGal, bottlesThisMonth, lowStockItems };
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

export function getEquipmentVolumeReport(): EquipmentVolumeReport[] {
  const equipment = getAllFloorEquipmentWithContext();
  return equipment.map((eq) => {
    if (eq.equipment_type === 'holding_tank' || eq.equipment_type === 'collection_vessel') {
      const contents = getHoldingTankContents(eq.id);
      const detail = contents.run_count > 0
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
      const run = queryOne<{ batch_number: string; charge_volume_gal: number; charge_abv: number | null; status: string; run_type: string; source_holding_tank_equipment_id: number | null }>(
        `SELECT batch_number, charge_volume_gal, charge_abv, status, run_type, source_holding_tank_equipment_id FROM distillation_runs
         WHERE still_name = ? AND status IN ('planned', 'running')
         ORDER BY run_date DESC LIMIT 1`,
        [eq.name],
      );
      let detail = run ? `Run ${run.batch_number} (${run.status})` : '';
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
          const prefix = run.run_type === 'heavy_rum' ? 'Heavy rum from' : 'Spirit from';
          detail = `${prefix} ${tankName} · ${detail}`;
        }
      }
      return {
        id: eq.id,
        name: eq.name,
        equipment_type: eq.equipment_type,
        status: eq.status,
        capacity_gal: eq.capacity_gal,
        volume_gal: run?.charge_volume_gal ?? 0,
        abv: run?.charge_abv ?? null,
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
    if (eq.equipment_type === 'holding_tank' || eq.equipment_type === 'collection_vessel') {
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
    if (eq.status !== 'in_use' || eq.equipment_type !== 'fermenter') return eq;
    const info = queryOne<{
      mash_batch_id: number;
      batch_number: string;
      volume_gal: number;
      status: string;
      actual_brix: number | null;
      target_brix: number | null;
    }>(`
      SELECT m.id AS mash_batch_id, m.batch_number, a.volume_gal, m.status, m.actual_brix, m.target_brix
      FROM mash_fermenter_assignments a
      JOIN mash_batches m ON m.id = a.mash_batch_id
      WHERE a.floor_equipment_id = ?
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

export function updateEquipmentMaintenance(
  equipmentId: number,
  maintenance_status: EquipmentMaintenanceStatus | null,
  maintenance_notes: string,
): void {
  runQuery(
    'UPDATE floor_equipment SET maintenance_status=?, maintenance_notes=? WHERE id=?',
    [maintenance_status, maintenance_notes.trim(), equipmentId],
  );
}

export function saveFloorEquipment(
  item: Omit<FloorEquipment, 'id' | 'created_at'>,
  id?: number,
): void {
  const maintenanceStatus = item.maintenance_status ?? null;
  const maintenanceNotes = item.maintenance_notes ?? '';
  if (id) {
    runQuery(
      `UPDATE floor_equipment SET floor_plan_id=?, name=?, equipment_type=?, pos_x_ft=?, pos_y_ft=?, width_ft=?, depth_ft=?, capacity_gal=?, status=?, linked_mash_batch_id=?, notes=?, maintenance_status=?, maintenance_notes=? WHERE id=?`,
      [item.floor_plan_id, item.name, item.equipment_type, item.pos_x_ft, item.pos_y_ft, item.width_ft, item.depth_ft, item.capacity_gal, item.status, item.linked_mash_batch_id, item.notes, maintenanceStatus, maintenanceNotes, id],
    );
  } else {
    insertRow(
      `INSERT INTO floor_equipment (floor_plan_id, name, equipment_type, pos_x_ft, pos_y_ft, width_ft, depth_ft, capacity_gal, status, linked_mash_batch_id, notes, maintenance_status, maintenance_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.floor_plan_id, item.name, item.equipment_type, item.pos_x_ft, item.pos_y_ft, item.width_ft, item.depth_ft, item.capacity_gal, item.status, item.linked_mash_batch_id, item.notes, maintenanceStatus, maintenanceNotes],
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
