import { queryAll } from '../../db/database';
import {
  getAllFermentationLogs,
  getAllFloorEquipmentWithContext,
  getAllMashFermenterAssignments,
  getBlendIngredients,
  getBottlingRuns,
  getDashboardThresholds,
  getEquipmentVolumeReport,
  getFermentationReadyMaxBrix,
  getHoldingTankVolumeVariances,
  getInventoryItems,
  getInventoryUsageLog,
  getMashBatches,
  getMonthlyProduction,
  getTankCleaningLog,
} from '../../db/queries';
import { buildBlendAlcoholAccount } from '../blend-alcohol-account';
import { additiveInputsFromBlendIngredients } from '../blend-formulation';
import { bottlingSentToTankGal, normalizeBottlingStatus } from '../bottling-lines';
import { buildCalendarEvents, type CalendarEvent } from '../calendar-events';
import { localCalendarDayKey } from '../date-input';
import { isSpiritLedgerEquipmentType } from '../equipment';
import { equipmentCleaningDaysDirty } from '../equipment-cleaning';
import { listOverdueFermentations } from '../fermentation';
import { laaGalFromVolumeAbv } from '../reporting/alcohol-units';
import { buildBlendReportRows } from '../reporting/blend-rows';
import { buildBottlingReportRows } from '../reporting/bottling-rows';
import { buildDistillationReportRows } from '../reporting/distillation-rows';
import { eventInReportRange, resolveReportPeriod, type ReportDateRange } from '../reporting/period';
import { tankCleaningCalendarEvents } from '../tank-cleaning-staff';
import { buildNeedsAttention, type AttentionItem } from './attention';
import {
  bottlingByProduct,
  inventoryTrend,
  productionVolumeSeries,
  yieldSeries,
  type BottlingProductPoint,
  type InventoryTrendPoint,
  type ProductionVolumePoint,
  type YieldPoint,
} from './charts';
import { buildAlcoholReconciliation, type AlcoholReconciliation } from './reconciliation';
import { buildTankStatusRows, type TankStatusRow, type TankStatusSource } from './tanks';

/** Alerts look back this far for variance and incomplete records. Running work is always included. */
export const ATTENTION_LOOKBACK_DAYS = 30;

function lookbackRange(today: string, days: number): ReportDateRange {
  const from = new Date(`${today}T00:00:00`);
  from.setDate(from.getDate() - days);
  const fromKey = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  return resolveReportPeriod('custom', fromKey, today);
}

function latestNeedsCleaningByEquipment(): Map<number, string> {
  const latest = new Map<number, string>();
  for (const row of getTankCleaningLog()) {
    if (row.eventType === 'needs_cleaning') latest.set(row.equipmentId, row.createdAt);
    else latest.delete(row.equipmentId);
  }
  return latest;
}

export function loadNeedsAttention(now: Date, today: string): AttentionItem[] {
  const thresholds = getDashboardThresholds();
  const mashes = getMashBatches();
  const mashById = new Map(mashes.map((mash) => [mash.id, mash]));
  const assignments = getAllMashFermenterAssignments();
  const logs = getAllFermentationLogs();

  const lastLog = new Map<string, string>();
  for (const log of logs) {
    const key = `${log.mash_batch_id}:${log.floor_equipment_id ?? '*'}`;
    const previous = lastLog.get(key);
    if (!previous || log.logged_at > previous) lastLog.set(key, log.logged_at);
  }
  const fermenting = assignments
    .filter((row) => {
      const mash = mashById.get(row.mash_batch_id);
      return mash?.status === 'fermenting'
        && row.volume_gal > 0.01
        && row.status !== 'complete'
        && row.status !== 'discarded';
    })
    .map((row) => {
      const mash = mashById.get(row.mash_batch_id)!;
      const own = lastLog.get(`${row.mash_batch_id}:${row.floor_equipment_id}`);
      const batchWide = lastLog.get(`${row.mash_batch_id}:*`);
      const latest = [own, batchWide].filter((value): value is string => Boolean(value)).sort().pop() ?? null;
      return {
        batchId: row.mash_batch_id,
        batchNumber: row.batch_number,
        equipmentId: row.floor_equipment_id,
        equipmentName: row.equipment_name,
        startedAt: mash.fermentation_start_date || mash.start_date || null,
        lastLogAt: latest,
      };
    });

  const window = lookbackRange(today, ATTENTION_LOOKBACK_DAYS);
  const runs = buildDistillationReportRows(resolveReportPeriod('all'))
    .filter((row) => row.status === 'running' || (row.status === 'complete' && eventInReportRange(row.run_date, window)))
    .map((row) => ({
      id: row.run_id,
      batch_number: row.batch_number,
      status: row.status,
      run_date: row.run_date,
      charge_volume_gal: row.charge_volume_gal,
      hearts_gal: row.hearts_gal,
    }));

  const lastLogDay = new Map<number, string>();
  for (const log of logs) {
    const day = localCalendarDayKey(log.logged_at);
    const previous = lastLogDay.get(log.mash_batch_id);
    if (day && (!previous || day > previous)) lastLogDay.set(log.mash_batch_id, day);
  }
  const washes = mashes
    .filter((mash) => mash.status === 'complete')
    .map((mash) => ({
      id: mash.id,
      batch_number: mash.batch_number,
      status: mash.status,
      completedOn: lastLogDay.get(mash.id) ?? mash.expected_completion_date ?? mash.start_date,
      actual_final_brix: mash.actual_final_brix,
    }))
    .filter((wash) => eventInReportRange(wash.completedOn, window));

  const bottlings = buildBottlingReportRows(window);
  const runningBottlingIds = new Set(
    getBottlingRuns().filter((run) => normalizeBottlingStatus(run.status) === 'running').map((run) => run.id),
  );
  const recentBottlings = bottlings.filter((row) => (
    runningBottlingIds.has(row.bottling_id) || row.bottle_count > 0 || row.bottled_gal > 0 || row.tank_draw_gal != null
  ));

  const volumes = getEquipmentVolumeReport();
  const tanks = volumes
    .filter((row) => isSpiritLedgerEquipmentType(row.equipment_type))
    .map((row) => ({ id: row.id, name: row.name, capacity_gal: row.capacity_gal, volume_gal: row.volume_gal }));

  const dirtySince = latestNeedsCleaningByEquipment();
  const equipment = getAllFloorEquipmentWithContext().map((item) => ({
    id: item.id,
    name: item.name,
    daysDirty: item.status === 'cleaning'
      ? equipmentCleaningDaysDirty(dirtySince.get(item.id) ?? null, today)
      : null,
    maintenance_status: item.maintenance_status,
  }));

  return buildNeedsAttention({
    now,
    thresholds,
    inventory: getInventoryItems(),
    fermenting,
    overdueFermentations: listOverdueFermentations(assignments, mashes, today),
    runs,
    washes,
    blends: buildBlendReportRows(window),
    bottlings: recentBottlings,
    tanks,
    equipment,
  });
}

export function loadTankStatus(): TankStatusRow[] {
  const volumes = new Map(getEquipmentVolumeReport().map((row) => [row.id, row]));
  const lastMeasured = new Map<number, string>();
  for (const row of getHoldingTankVolumeVariances()) {
    const tankId = row.tank_equipment_id;
    const previous = lastMeasured.get(tankId);
    if (!previous || row.recorded_at > previous) lastMeasured.set(tankId, row.recorded_at);
  }
  const stillRuns = new Map<string, 'running' | 'planned'>();
  for (const run of queryAll<{ still_name: string; status: string }>(
    `SELECT still_name, status FROM distillation_runs WHERE status IN ('running', 'planned')`,
  )) {
    if (run.status === 'running' || !stillRuns.has(run.still_name)) {
      stillRuns.set(run.still_name, run.status === 'running' ? 'running' : 'planned');
    }
  }
  const sources: TankStatusSource[] = getAllFloorEquipmentWithContext().map((item) => {
    const volume = volumes.get(item.id);
    return {
      id: item.id,
      name: item.name,
      equipment_type: item.equipment_type,
      status: item.status,
      capacity_gal: item.capacity_gal,
      maintenance_status: item.maintenance_status,
      volume_gal: volume?.volume_gal ?? 0,
      abv: volume?.abv ?? null,
      contents: volume?.detail || item.active_liquid_name || '',
      batch_number: item.active_batch_number ?? null,
      mash_batch_id: item.linked_mash_batch_id,
      mash_status: item.active_mash_status ?? null,
      latest_brix: item.active_latest_brix ?? null,
      still_run_status: stillRuns.get(item.name) ?? null,
      holds_blend: Boolean(item.active_liquid_name),
      last_measured_at: lastMeasured.get(item.id) ?? null,
    };
  });
  return buildTankStatusRows(sources, getFermentationReadyMaxBrix());
}

/** Production and cleaning work, the same records the Calendar shows. */
export function loadScheduleEvents(): CalendarEvent[] {
  return [...buildCalendarEvents(), ...tankCleaningCalendarEvents(getTankCleaningLog())];
}

export interface DashboardVariance {
  blends: ReturnType<typeof buildBlendReportRows>;
  bottlings: ReturnType<typeof buildBottlingReportRows>;
}

export function loadVariance(range: ReportDateRange): DashboardVariance {
  return {
    blends: buildBlendReportRows(range),
    bottlings: buildBottlingReportRows(range),
  };
}

function blendAdditiveLaaGal(blendId: number): number {
  const additives = additiveInputsFromBlendIngredients(getBlendIngredients(blendId))
    .filter((row) => (row.abv ?? 0) > 0);
  if (additives.length === 0) return 0;
  try {
    const account = buildBlendAlcoholAccount([], additives);
    return account.ok ? account.absoluteAlcoholGal : 0;
  } catch {
    return 0;
  }
}

export function loadAlcoholReconciliation(range: ReportDateRange, today: string): AlcoholReconciliation {
  const inRange = (value: string | null | undefined) => eventInReportRange(value ?? '', range);

  const runs = buildDistillationReportRows(range)
    .filter((row) => row.status === 'complete')
    .map((row) => ({
      id: row.run_id,
      batch_number: row.batch_number,
      charged_laa_gal: row.alcohol_charged_gal,
      collected_laa_gal: row.alcohol_collected_gal,
    }));

  const cuts = queryAll<{
    id: number; run_id: number; batch_number: string; volume_gal: number; abv: number;
    occurred_at: string; tank_id: number | null;
  }>(`
    SELECT c.id, r.id as run_id, r.batch_number, c.volume_gal, c.abv, c.start_time as occurred_at,
           c.holding_tank_equipment_id as tank_id
    FROM distillation_cuts c
    JOIN distillation_runs r ON r.id = c.distillation_run_id
    WHERE c.volume_gal > 0
  `).filter((row) => inRange(row.occurred_at)).map((row) => ({
    id: row.id,
    run_id: row.run_id,
    batch_number: row.batch_number,
    volume_gal: row.volume_gal,
    abv: row.abv,
    into_tank: row.tank_id != null,
  }));

  const charges = [
    ...queryAll<{ run_id: number; batch_number: string; run_date: string; volume_gal: number; abv: number }>(`
      SELECT r.id as run_id, r.batch_number, r.run_date, s.volume_gal, s.abv
      FROM distillation_run_tank_sources s
      JOIN distillation_runs r ON r.id = s.distillation_run_id
      WHERE s.volume_gal > 0 AND r.status != 'planned'
    `),
    ...queryAll<{ run_id: number; batch_number: string; run_date: string; volume_gal: number; abv: number }>(`
      SELECT r.id as run_id, r.batch_number, r.run_date,
             CASE WHEN COALESCE(r.proof_water_gal, 0) > 0.001 AND r.proof_spirit_gal IS NOT NULL
                  THEN r.proof_spirit_gal ELSE r.charge_volume_gal END as volume_gal,
             CASE WHEN COALESCE(r.proof_water_gal, 0) > 0.001 AND r.proof_spirit_gal IS NOT NULL
                  THEN COALESCE(r.proof_spirit_abv, 0) ELSE COALESCE(r.charge_abv, 0) END as abv
      FROM distillation_runs r
      WHERE r.source_holding_tank_equipment_id IS NOT NULL AND r.charge_volume_gal > 0
        AND r.status != 'planned'
        AND NOT EXISTS (SELECT 1 FROM distillation_run_tank_sources s WHERE s.distillation_run_id = r.id)
    `),
  ].filter((row) => inRange(row.run_date));

  const transfers = queryAll<{
    id: number; occurred_at: string; volume_gal: number; abv: number; dest: number | null; source: number;
  }>(`
    SELECT id, COALESCE(created_at, transfer_date) as occurred_at, volume_gal, abv,
           dest_tank_equipment_id as dest, source_tank_equipment_id as source
    FROM holding_tank_transfers WHERE volume_gal > 0
  `).filter((row) => inRange(row.occurred_at)).map((row) => ({
    id: row.id,
    volume_gal: row.volume_gal,
    abv: row.abv,
    discarded: row.dest == null,
    source_tank_id: row.source,
  }));

  const dilutions = queryAll<{
    id: number; tank_id: number; tank_name: string; spirit_volume_gal: number; spirit_abv: number;
    water_gal: number; finished_volume_gal: number; finished_abv: number; recorded_at: string;
  }>(`
    SELECT d.id, d.tank_equipment_id as tank_id, e.name as tank_name, d.spirit_volume_gal, d.spirit_abv,
           d.water_gal, d.finished_volume_gal, d.finished_abv, d.recorded_at
    FROM holding_tank_dilutions d
    JOIN floor_equipment e ON e.id = d.tank_equipment_id
  `).filter((row) => inRange(row.recorded_at));

  const blendSources = queryAll<{ blend_id: number; volume_gal: number; abv: number; from_barrel: number }>(`
    SELECT blend_product_id as blend_id, volume_gal, abv,
           CASE WHEN barrel_id IS NOT NULL THEN 1 ELSE 0 END as from_barrel
    FROM blend_spirit_sources WHERE volume_gal > 0
  `);
  const blends = queryAll<{
    id: number; batch_number: string; occurred_at: string; volume_gal: number; abv: number;
  }>(`
    SELECT id, batch_number, COALESCE(executed_at, blend_date, created_at) as occurred_at,
           COALESCE(NULLIF(actual_volume_gal, 0), final_volume_gal) as volume_gal,
           COALESCE(NULLIF(actual_abv, 0), final_abv) as abv
    FROM blend_products
    WHERE status IN ('executed', 'bottled', 'blended') AND final_volume_gal > 0
  `).filter((row) => inRange(row.occurred_at)).map((row) => {
    const sources = blendSources.filter((source) => source.blend_id === row.id);
    return {
      id: row.id,
      batch_number: row.batch_number,
      tank_draw_laa_gal: sources.filter((s) => !s.from_barrel).reduce((t, s) => t + laaGalFromVolumeAbv(s.volume_gal, s.abv), 0),
      barrel_draw_laa_gal: sources.filter((s) => s.from_barrel).reduce((t, s) => t + laaGalFromVolumeAbv(s.volume_gal, s.abv), 0),
      additive_laa_gal: blendAdditiveLaaGal(row.id),
      output_volume_gal: row.volume_gal,
      output_abv: row.abv,
    };
  });

  const barrelFills = queryAll<{ id: number; fill_date: string; volume_gal: number; abv: number }>(`
    SELECT id, fill_date, volume_gal, abv FROM barrel_fills
    WHERE volume_gal > 0 AND source_holding_tank_equipment_id IS NOT NULL
  `).filter((row) => inRange(row.fill_date));

  const bottlings = getBottlingRuns()
    .filter((run) => normalizeBottlingStatus(run.status) !== 'planned' && inRange(run.bottling_date))
    .map((run) => {
      const fromTank = run.source_holding_tank_equipment_id != null && run.source_volume_gal != null;
      const bottledAbv = run.measured_abv != null && run.measured_abv > 0 ? run.measured_abv : run.final_abv;
      return {
        id: run.id,
        batch_number: run.batch_number,
        draw_gal: fromTank ? run.source_volume_gal : null,
        draw_abv: fromTank ? (run.source_abv ?? run.final_abv) : null,
        bottled_gal: run.bottled_volume_gal ?? 0,
        bottled_abv: bottledAbv,
        returned_gal: bottlingSentToTankGal(run),
      };
    });

  const corrections = getHoldingTankVolumeVariances()
    .filter((row) => inRange(row.recorded_at))
    .map((row) => ({
      id: row.id,
      tank_id: row.tank_equipment_id,
      tank_name: row.tank_name,
      book_volume_gal: row.book_volume_gal,
      book_abv: row.book_abv,
      set_volume_gal: row.set_volume_gal,
      set_abv: row.set_abv,
    }));

  const closingTankLaaGal = getEquipmentVolumeReport()
    .filter((row) => isSpiritLedgerEquipmentType(row.equipment_type) && row.abv != null)
    .reduce((total, row) => total + laaGalFromVolumeAbv(row.volume_gal, row.abv ?? 0), 0);

  return buildAlcoholReconciliation({
    runs,
    cuts,
    charges,
    transfers,
    dilutions,
    blends,
    barrelFills,
    bottlings,
    corrections,
    closingTankLaaGal,
    periodEndsToday: range.to == null || range.to >= today,
  });
}

export interface DashboardCharts {
  production: ProductionVolumePoint[];
  bottlingByProduct: BottlingProductPoint[];
  yield: YieldPoint[];
}

export function loadDashboardCharts(range: ReportDateRange, today: string): DashboardCharts {
  const runs = buildDistillationReportRows(resolveReportPeriod('all'))
    .filter((row) => row.status === 'complete')
    .map((row) => ({
      run_date: row.run_date,
      charged_laa_gal: row.alcohol_charged_gal,
      collected_laa_gal: row.alcohol_collected_gal,
    }));
  return {
    production: productionVolumeSeries(getMonthlyProduction(), today),
    bottlingByProduct: bottlingByProduct(buildBottlingReportRows(range)),
    yield: yieldSeries(runs, today),
  };
}

export function loadInventoryTrend(itemId: number, today: string, days = 30): InventoryTrendPoint[] {
  const item = getInventoryItems().find((row) => row.id === itemId);
  if (!item) return [];
  return inventoryTrend(getInventoryUsageLog(itemId, 1000), item.quantity, today, days);
}
