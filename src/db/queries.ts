import { useCallback, useEffect, useState } from 'react';
import { initDatabase, clearAllData } from './database';
import type {
  Barrel,
  BlendIngredient,
  BlendIngredientInput,
  BlendProduct,
  BlendProductView,
  BottlingRun,
  DistillationCut,
  DistillationCutView,
  HoldingTankContents,
  DistillationRun,
  DistillationRunView,
  FermentationLog,
  FermentationLogView,
  MashFermenterAssignment,
  FloorEquipment,
  FloorEquipmentView,
  FloorPlan,
  InventoryItem,
  MashBatch,
  ProductionSummary,
  EquipmentVolumeReport,
  YieldReport,
} from '../types';
import {
  insertRow,
  queryAll,
  queryOne,
  runQuery,
} from './database';
import { computeBlendTotals } from '../lib/blending';

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
      `UPDATE mash_batches SET batch_number=?, recipe_name=?, grain_type=?, grain_lbs=?, water_gal=?, yeast_strain=?, yeast_lbs=?, start_date=?, target_brix=?, actual_brix=?, target_final_brix=?, status=?, notes=? WHERE id=?`,
      [batch.batch_number, batch.recipe_name, batch.grain_type, batch.grain_lbs, batch.water_gal, batch.yeast_strain, batch.yeast_lbs, batch.start_date, batch.target_brix, batch.actual_brix, batch.target_final_brix, batch.status, batch.notes, id],
    );
    return id;
  }
  return insertRow(
    `INSERT INTO mash_batches (batch_number, recipe_name, grain_type, grain_lbs, water_gal, yeast_strain, yeast_lbs, start_date, target_brix, actual_brix, target_final_brix, actual_final_brix, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batch.batch_number, batch.recipe_name, batch.grain_type, batch.grain_lbs, batch.water_gal, batch.yeast_strain, batch.yeast_lbs, batch.start_date, batch.target_brix, batch.actual_brix, batch.target_final_brix, batch.actual_final_brix, batch.status, batch.notes],
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

export function getChargeableFermentersForMash(
  mashBatchId: number,
  excludeRunId?: number,
): (MashFermenterAssignment & { equipment_name: string })[] {
  const assignments = getMashFermenterAssignments(mashBatchId);
  return assignments.filter((a) => {
    const alreadyCharged = queryOne<{ id: number }>(
      `SELECT id FROM distillation_runs
       WHERE source_mash_batch_id = ?
         AND source_fermenter_equipment_id = ?
         AND status IN ('planned', 'running', 'complete')
         AND (? IS NULL OR id != ?)
       LIMIT 1`,
      [mashBatchId, a.floor_equipment_id, excludeRunId ?? null, excludeRunId ?? -1],
    );
    return !alreadyCharged;
  });
}

export function getAvailableFermenters(forMashBatchId?: number): FloorEquipment[] {
  return getFloorEquipment().filter(
    (e) => e.equipment_type === 'fermenter' && isFermenterAvailable(e.id, forMashBatchId),
  );
}

export function getPotStills(): FloorEquipment[] {
  return getFloorEquipment().filter(
    (e) => e.equipment_type === 'pot_still' || e.equipment_type === 'column_still',
  );
}

export function getHoldingTanks(): FloorEquipment[] {
  syncHoldingTankStatuses();
  return getFloorEquipment().filter((e) => e.equipment_type === 'holding_tank');
}

export function getHoldingTankContents(
  tankId: number,
  excludeRunId?: number,
  excludeBlendId?: number,
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

  const blendOuts = queryOne<{ volume_gal: number; gpa: number }>(`
    SELECT
      COALESCE(SUM(base_spirit_volume_gal), 0) as volume_gal,
      COALESCE(SUM(base_spirit_volume_gal * base_spirit_abv / 100), 0) as gpa
    FROM blend_products
    WHERE source_holding_tank_equipment_id = ?
      AND status IN ('draft', 'blended')
      AND (? IS NULL OR id != ?)
  `, [tankId, excludeBlendId ?? null, excludeBlendId ?? -1]);

  const volumeIn = ins?.volume_gal ?? 0;
  const volumeOut = (runOuts?.volume_gal ?? 0) + (blendOuts?.volume_gal ?? 0);
  const gpaIn = ins?.gpa ?? 0;
  const gpaOut = (runOuts?.gpa ?? 0) + (blendOuts?.gpa ?? 0);
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

export function defaultHighWinesTankId(excludeTankId?: number | null): number | null {
  const tanks = getHighWinesDestinationTanks(excludeTankId);
  const preferred = tanks.find(
    (t) => t.name.toLowerCase().includes('spirit') || t.name.toLowerCase().includes('high'),
  );
  return preferred?.id ?? tanks[0]?.id ?? null;
}

export function syncHoldingTankStatuses(): void {
  const tanks = queryAll<FloorEquipment>(
    "SELECT * FROM floor_equipment WHERE equipment_type = 'holding_tank'",
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

    const shouldBeInUse = !!row && !['complete', 'discarded'].includes(row.status);

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
    insertRow(
      `INSERT INTO mash_fermenter_assignments (mash_batch_id, floor_equipment_id, volume_gal) VALUES (?, ?, ?)`,
      [mashBatchId, a.equipmentId, a.volumeGal],
    );
  }
  syncFermenterAndStillStatuses();
}

export function saveMashBatchWithFermenters(
  batch: Omit<MashBatch, 'id' | 'created_at'>,
  assignments: FermenterAssignmentInput[],
  id?: number,
): number {
  const previous = id ? getMashBatch(id) : undefined;
  const mashId = saveMashBatch(batch, id);
  saveMashFermenterAssignments(mashId, assignments);
  applyMashInventoryUsage(batch, previous);
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

function chargeFermenterForDistillation(mashBatchId: number, equipmentId: number): void {
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
  releaseFermentersForMash(id);
  runQuery('DELETE FROM mash_batches WHERE id = ?', [id]);
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
  const runType = run.run_type ?? 'wash';
  if (id) {
    runQuery(
      `UPDATE distillation_runs SET batch_number=?, run_type=?, source_mash_batch_id=?, source_fermenter_equipment_id=?, source_holding_tank_equipment_id=?, dest_holding_tank_equipment_id=?, still_name=?, run_date=?, charge_volume_gal=?, charge_abv=?, status=?, notes=? WHERE id=?`,
      [
        run.batch_number,
        runType,
        runType === 'wash' ? run.source_mash_batch_id : null,
        runType === 'wash' ? run.source_fermenter_equipment_id : null,
        runType === 'low_wines' ? run.source_holding_tank_equipment_id : null,
        runType === 'low_wines' ? run.dest_holding_tank_equipment_id : null,
        run.still_name,
        run.run_date,
        run.charge_volume_gal,
        runType === 'low_wines' ? run.charge_abv : null,
        run.status,
        run.notes,
        id,
      ],
    );
  } else {
    insertRow(
      `INSERT INTO distillation_runs (batch_number, run_type, source_mash_batch_id, source_fermenter_equipment_id, source_holding_tank_equipment_id, dest_holding_tank_equipment_id, still_name, run_date, charge_volume_gal, charge_abv, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.batch_number,
        runType,
        runType === 'wash' ? run.source_mash_batch_id : null,
        runType === 'wash' ? run.source_fermenter_equipment_id : null,
        runType === 'low_wines' ? run.source_holding_tank_equipment_id : null,
        runType === 'low_wines' ? run.dest_holding_tank_equipment_id : null,
        run.still_name,
        run.run_date,
        run.charge_volume_gal,
        runType === 'low_wines' ? run.charge_abv : null,
        run.status,
        run.notes,
      ],
    );
  }

  if (runType === 'wash' && run.source_mash_batch_id && run.source_fermenter_equipment_id) {
    chargeFermenterForDistillation(run.source_mash_batch_id, run.source_fermenter_equipment_id);
  } else if (runType === 'wash' && run.source_mash_batch_id && (run.status === 'running' || run.status === 'complete')) {
    releaseFermentersForMash(run.source_mash_batch_id);
    maybeCompleteMashAfterCharge(run.source_mash_batch_id);
  }

  syncHoldingTankStatuses();
  syncFermenterAndStillStatuses();
}

export function deleteDistillationRun(id: number): void {
  runQuery('DELETE FROM distillation_runs WHERE id = ?', [id]);
  syncHoldingTankStatuses();
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

export function saveBarrel(barrel: Omit<Barrel, 'id' | 'created_at'>, id?: number): void {
  if (id) {
    runQuery(
      `UPDATE barrels SET barrel_number=?, wood_type=?, capacity_gal=?, fill_date=?, spirit_type=?, source_run_id=?, initial_abv=?, current_volume_gal=?, warehouse_location=?, status=?, notes=? WHERE id=?`,
      [barrel.barrel_number, barrel.wood_type, barrel.capacity_gal, barrel.fill_date, barrel.spirit_type, barrel.source_run_id, barrel.initial_abv, barrel.current_volume_gal, barrel.warehouse_location, barrel.status, barrel.notes, id],
    );
  } else {
    insertRow(
      `INSERT INTO barrels (barrel_number, wood_type, capacity_gal, fill_date, spirit_type, source_run_id, initial_abv, current_volume_gal, warehouse_location, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [barrel.barrel_number, barrel.wood_type, barrel.capacity_gal, barrel.fill_date, barrel.spirit_type, barrel.source_run_id, barrel.initial_abv, barrel.current_volume_gal, barrel.warehouse_location, barrel.status, barrel.notes],
    );
  }
}

export function deleteBarrel(id: number): void {
  runQuery('DELETE FROM barrels WHERE id = ?', [id]);
}

// ── Bottling ───────────────────────────────────────────────

export function getBottlingRuns(): BottlingRun[] {
  return queryAll<BottlingRun>(
    'SELECT * FROM bottling_runs ORDER BY bottling_date DESC',
  );
}

export function saveBottlingRun(run: Omit<BottlingRun, 'id' | 'created_at'>, id?: number): void {
  if (id) {
    runQuery(
      `UPDATE bottling_runs SET batch_number=?, source_barrel_id=?, source_run_id=?, bottling_date=?, bottle_size_ml=?, bottle_count=?, final_abv=?, product_name=?, lot_number=?, notes=? WHERE id=?`,
      [run.batch_number, run.source_barrel_id, run.source_run_id, run.bottling_date, run.bottle_size_ml, run.bottle_count, run.final_abv, run.product_name, run.lot_number, run.notes, id],
    );
  } else {
    insertRow(
      `INSERT INTO bottling_runs (batch_number, source_barrel_id, source_run_id, bottling_date, bottle_size_ml, bottle_count, final_abv, product_name, lot_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [run.batch_number, run.source_barrel_id, run.source_run_id, run.bottling_date, run.bottle_size_ml, run.bottle_count, run.final_abv, run.product_name, run.lot_number, run.notes],
    );
  }
}

export function deleteBottlingRun(id: number): void {
  runQuery('DELETE FROM bottling_runs WHERE id = ?', [id]);
}

// ── Blending ───────────────────────────────────────────────

export function getBlendProducts(): BlendProductView[] {
  return queryAll(
    `SELECT b.*, fe.name as source_tank_name
     FROM blend_products b
     JOIN floor_equipment fe ON fe.id = b.source_holding_tank_equipment_id
     ORDER BY b.blend_date DESC`,
  );
}

export function getBlendIngredients(blendProductId: number): BlendIngredient[] {
  return queryAll(
    'SELECT * FROM blend_ingredients WHERE blend_product_id = ? ORDER BY id',
    [blendProductId],
  );
}

export function saveBlendProduct(
  product: Omit<BlendProduct, 'id' | 'created_at' | 'final_volume_gal' | 'final_abv'>,
  ingredients: BlendIngredientInput[],
  id?: number,
): number {
  const { finalVolumeGal, finalAbv } = computeBlendTotals(
    product.base_spirit_volume_gal,
    product.base_spirit_abv,
    ingredients,
  );

  if (id) {
    runQuery(
      `UPDATE blend_products SET batch_number=?, product_name=?, source_holding_tank_equipment_id=?, base_spirit_volume_gal=?, base_spirit_abv=?, blend_date=?, target_abv=?, final_volume_gal=?, final_abv=?, status=?, notes=? WHERE id=?`,
      [
        product.batch_number,
        product.product_name,
        product.source_holding_tank_equipment_id,
        product.base_spirit_volume_gal,
        product.base_spirit_abv,
        product.blend_date,
        product.target_abv,
        finalVolumeGal,
        finalAbv,
        product.status,
        product.notes,
        id,
      ],
    );
    runQuery('DELETE FROM blend_ingredients WHERE blend_product_id = ?', [id]);
  } else {
    id = insertRow(
      `INSERT INTO blend_products (batch_number, product_name, source_holding_tank_equipment_id, base_spirit_volume_gal, base_spirit_abv, blend_date, target_abv, final_volume_gal, final_abv, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.batch_number,
        product.product_name,
        product.source_holding_tank_equipment_id,
        product.base_spirit_volume_gal,
        product.base_spirit_abv,
        product.blend_date,
        product.target_abv,
        finalVolumeGal,
        finalAbv,
        product.status,
        product.notes,
      ],
    );
  }

  for (const ing of ingredients) {
    if (ing.amount <= 0 && !ing.name.trim()) continue;
    insertRow(
      `INSERT INTO blend_ingredients (blend_product_id, ingredient_type, name, amount, unit, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, ing.ingredient_type, ing.name, ing.amount, ing.unit, ing.notes],
    );
  }

  syncHoldingTankStatuses();
  return id;
}

export function deleteBlendProduct(id: number): void {
  runQuery('DELETE FROM blend_products WHERE id = ?', [id]);
  syncHoldingTankStatuses();
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
      `SELECT COALESCE(SUM(bottle_count), 0) as total FROM bottling_runs
       WHERE strftime('%Y-%m', bottling_date) = ?`,
      [reportMonth],
    )?.total ?? 0
    : queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(bottle_count), 0) as total FROM bottling_runs",
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

export function getEquipmentVolumeReport(): EquipmentVolumeReport[] {
  const equipment = getFloorEquipmentWithContext();
  return equipment.map((eq) => {
    if (eq.equipment_type === 'holding_tank') {
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
      const run = queryOne<{ batch_number: string; charge_volume_gal: number; status: string; run_type: string; source_holding_tank_equipment_id: number | null }>(
        `SELECT batch_number, charge_volume_gal, status, run_type, source_holding_tank_equipment_id FROM distillation_runs
         WHERE still_name = ? AND status IN ('planned', 'running')
         ORDER BY run_date DESC LIMIT 1`,
        [eq.name],
      );
      let detail = run ? `Run ${run.batch_number} (${run.status})` : '';
      if (run?.run_type === 'low_wines' && run.source_holding_tank_equipment_id) {
        const tankName = queryOne<{ name: string }>(
          'SELECT name FROM floor_equipment WHERE id = ?',
          [run.source_holding_tank_equipment_id],
        )?.name;
        if (tankName) detail = `Low wines from ${tankName} · ${detail}`;
      }
      return {
        id: eq.id,
        name: eq.name,
        equipment_type: eq.equipment_type,
        status: eq.status,
        capacity_gal: eq.capacity_gal,
        volume_gal: run?.charge_volume_gal ?? 0,
        abv: null,
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

export function getFloorPlan(): FloorPlan {
  return queryOne<FloorPlan>('SELECT * FROM floor_plans ORDER BY id LIMIT 1')
    ?? { id: 1, name: 'Production Floor', width_ft: 80, height_ft: 60, notes: '' };
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
    if (eq.equipment_type === 'holding_tank') {
      const contents = getHoldingTankContents(eq.id);
      if (contents.volume_gal <= 0) return eq;
      return {
        ...eq,
        active_volume_gal: contents.volume_gal,
        active_abv: contents.abv,
        active_run_count: contents.run_count,
      };
    }
    if (eq.status !== 'in_use' || eq.equipment_type !== 'fermenter') return eq;
    const info = queryOne<{ batch_number: string; volume_gal: number }>(`
      SELECT m.batch_number, a.volume_gal
      FROM mash_fermenter_assignments a
      JOIN mash_batches m ON m.id = a.mash_batch_id
      WHERE a.floor_equipment_id = ?
      LIMIT 1
    `, [eq.id]);
    if (!info) return eq;
    return {
      ...eq,
      active_batch_number: info.batch_number,
      active_volume_gal: info.volume_gal,
    };
  });
}

export function saveFloorEquipment(
  item: Omit<FloorEquipment, 'id' | 'created_at'>,
  id?: number,
): void {
  if (id) {
    runQuery(
      `UPDATE floor_equipment SET name=?, equipment_type=?, pos_x_ft=?, pos_y_ft=?, width_ft=?, depth_ft=?, capacity_gal=?, status=?, linked_mash_batch_id=?, notes=? WHERE id=?`,
      [item.name, item.equipment_type, item.pos_x_ft, item.pos_y_ft, item.width_ft, item.depth_ft, item.capacity_gal, item.status, item.linked_mash_batch_id, item.notes, id],
    );
  } else {
    insertRow(
      `INSERT INTO floor_equipment (floor_plan_id, name, equipment_type, pos_x_ft, pos_y_ft, width_ft, depth_ft, capacity_gal, status, linked_mash_batch_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.floor_plan_id, item.name, item.equipment_type, item.pos_x_ft, item.pos_y_ft, item.width_ft, item.depth_ft, item.capacity_gal, item.status, item.linked_mash_batch_id, item.notes],
    );
  }
}

export function updateEquipmentPosition(id: number, pos_x_ft: number, pos_y_ft: number): void {
  runQuery('UPDATE floor_equipment SET pos_x_ft=?, pos_y_ft=? WHERE id=?', [pos_x_ft, pos_y_ft, id]);
}

export function deleteFloorEquipment(id: number): void {
  runQuery('DELETE FROM floor_equipment WHERE id = ?', [id]);
}
