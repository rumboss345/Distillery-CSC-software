import { queryAll } from '../../db/database';
import { completeFermentationsSelectedForDistillation } from '../../db/queries';
import { estimateAbvFromBrix } from '../fermentation';
import { eventInReportRange, type ReportDateRange } from './period';

export interface FermentationHistoryRow {
  key: string;
  batch_number: string;
  recipe_name: string;
  fermenter_name: string;
  volume_gal: number | null;
  start_date: string;
  start_brix: number | null;
  finish_brix: number | null;
  alcohol_pct: number | null;
  status: string;
  operator: string;
}

/**
 * Finishing Brix is the last reading logged on that fermenter.
 * A wash with no logs uses the finishing Brix stored on the batch.
 * Alc % is estimated from the measured start Brix and that finishing Brix.
 */
export function fermentationFinishReading(
  startBrix: number | null,
  fermenterBrix: number | null,
  mashLatestBrix: number | null,
  actualFinalBrix: number | null,
  fermenterId: number | null,
): { finish_brix: number | null; alcohol_pct: number | null } {
  const finish = fermenterId != null
    ? (fermenterBrix ?? (mashLatestBrix == null ? actualFinalBrix : null))
    : (mashLatestBrix ?? actualFinalBrix);
  return {
    finish_brix: finish,
    alcohol_pct: startBrix != null && finish != null
      ? estimateAbvFromBrix(startBrix, finish)
      : null,
  };
}

function loadLatestFermentationBrix(): Map<string, number> {
  const latest = new Map<string, number>();
  const logs = queryAll<{
    mash_batch_id: number;
    floor_equipment_id: number | null;
    brix: number;
  }>(`
    SELECT mash_batch_id, floor_equipment_id, brix
    FROM fermentation_logs
    WHERE brix IS NOT NULL
    ORDER BY logged_at DESC, id DESC
  `);
  for (const log of logs) {
    if (log.floor_equipment_id != null) {
      const key = `${log.mash_batch_id}:${log.floor_equipment_id}`;
      if (!latest.has(key)) latest.set(key, log.brix);
    }
    const mashKey = `${log.mash_batch_id}:`;
    if (!latest.has(mashKey)) latest.set(mashKey, log.brix);
  }
  return latest;
}

export function buildFermentationHistoryRows(range: ReportDateRange): FermentationHistoryRow[] {
  completeFermentationsSelectedForDistillation();
  const rows = queryAll<{
    mash_id: number;
    assignment_id: number | null;
    floor_equipment_id: number | null;
    batch_number: string;
    recipe_name: string;
    fermenter_name: string | null;
    volume_gal: number | null;
    start_date: string;
    actual_brix: number | null;
    actual_final_brix: number | null;
    row_status: string;
    assigned_user_name: string | null;
  }>(`
    SELECT m.id as mash_id, a.id as assignment_id, a.floor_equipment_id, m.batch_number, m.recipe_name,
           fe.name as fermenter_name, a.volume_gal, m.start_date, m.actual_brix, m.actual_final_brix,
           COALESCE(a.status, m.status) as row_status, m.assigned_user_name
    FROM mash_batches m
    LEFT JOIN mash_fermenter_assignments a ON a.mash_batch_id = m.id
    LEFT JOIN floor_equipment fe ON fe.id = a.floor_equipment_id
    WHERE (
      (
        (m.status = 'complete' OR a.status = 'complete')
        AND COALESCE(a.status, m.status) != 'discarded'
      )
      OR a.status = 'discarded'
      OR (
        m.status = 'discarded'
        AND a.id IS NULL
        AND EXISTS (
          SELECT 1 FROM fermentation_logs fl WHERE fl.mash_batch_id = m.id
        )
      )
    )
    ORDER BY m.start_date DESC, m.id DESC, a.id DESC
  `);

  const released = queryAll<{
    mash_id: number;
    fermenter_id: number;
    batch_number: string;
    recipe_name: string;
    fermenter_name: string | null;
    volume_gal: number | null;
    start_date: string;
    actual_brix: number | null;
    actual_final_brix: number | null;
    assigned_user_name: string | null;
    run_date: string;
  }>(`
    SELECT m.id as mash_id, fe.id as fermenter_id, m.batch_number, m.recipe_name,
           fe.name as fermenter_name,
           SUM(r.charge_volume_gal) as volume_gal,
           m.start_date, m.actual_brix, m.actual_final_brix, m.assigned_user_name,
           MAX(r.run_date) as run_date
    FROM distillation_runs r
    JOIN mash_batches m ON m.id = r.source_mash_batch_id
    JOIN floor_equipment fe ON fe.id = r.source_fermenter_equipment_id
    WHERE r.run_type IN ('wash', 'heavy_rum')
      AND r.source_mash_batch_id IS NOT NULL
      AND r.source_fermenter_equipment_id IS NOT NULL
      AND m.status != 'discarded'
      AND NOT EXISTS (
        SELECT 1 FROM mash_fermenter_assignments a
        WHERE a.mash_batch_id = r.source_mash_batch_id
          AND a.floor_equipment_id = r.source_fermenter_equipment_id
      )
    GROUP BY m.id, fe.id
    ORDER BY m.start_date DESC, m.id DESC, fe.id DESC
  `);
  const releasedMashIds = new Set(released.map((row) => row.mash_id));
  const runDates = queryAll<{
    mash_batch_id: number;
    floor_equipment_id: number;
    run_date: string;
  }>(`
    SELECT source_mash_batch_id as mash_batch_id,
           source_fermenter_equipment_id as floor_equipment_id,
           run_date
    FROM distillation_runs
    WHERE run_type IN ('wash', 'heavy_rum')
      AND source_mash_batch_id IS NOT NULL
      AND source_fermenter_equipment_id IS NOT NULL
  `);
  const datesFor = (mashId: number, fermenterId: number | null): string[] => runDates
    .filter((run) => run.mash_batch_id === mashId && (fermenterId == null || run.floor_equipment_id === fermenterId))
    .map((run) => run.run_date);
  const listedInPeriod = (startDate: string, mashId: number, fermenterId: number | null) => (
    eventInReportRange(startDate, range) || datesFor(mashId, fermenterId).some((date) => eventInReportRange(date, range))
  );

  const latestBrix = loadLatestFermentationBrix();
  const finishFor = (
    mashId: number,
    fermenterId: number | null,
    startBrix: number | null,
    actualFinalBrix: number | null,
  ) => fermentationFinishReading(
    startBrix,
    fermenterId != null ? latestBrix.get(`${mashId}:${fermenterId}`) ?? null : null,
    latestBrix.has(`${mashId}:`) ? latestBrix.get(`${mashId}:`) ?? null : null,
    actualFinalBrix,
    fermenterId,
  );

  const listed = rows
    .filter((row) => !(row.assignment_id == null && releasedMashIds.has(row.mash_id)))
    .filter((row) => listedInPeriod(row.start_date, row.mash_id, row.floor_equipment_id))
    .map((row) => ({
      key: row.assignment_id != null ? `assign-${row.assignment_id}` : `batch-${row.mash_id}`,
      batch_number: row.batch_number,
      recipe_name: row.recipe_name || 'Wash',
      fermenter_name: row.fermenter_name || 'Not assigned',
      volume_gal: row.volume_gal,
      start_date: row.start_date,
      start_brix: row.actual_brix,
      ...finishFor(row.mash_id, row.floor_equipment_id, row.actual_brix, row.actual_final_brix),
      status: row.row_status,
      operator: row.assigned_user_name?.trim() || '—',
    }));

  const charged = released
    .filter((row) => listedInPeriod(row.start_date, row.mash_id, row.fermenter_id))
    .map((row) => ({
      key: `charged-${row.mash_id}-${row.fermenter_id}`,
      batch_number: row.batch_number,
      recipe_name: row.recipe_name || 'Wash',
      fermenter_name: row.fermenter_name || 'Not assigned',
      volume_gal: row.volume_gal,
      start_date: row.start_date,
      start_brix: row.actual_brix,
      ...finishFor(row.mash_id, row.fermenter_id, row.actual_brix, row.actual_final_brix),
      status: 'complete',
      operator: row.assigned_user_name?.trim() || '—',
    }));

  return [...listed, ...charged];
}

export interface FermentationLeftoverRow {
  key: string;
  batch_number: string;
  recipe_name: string;
  fermenter_name: string;
  volume_gal: number;
  discarded_date: string;
  notes: string;
  who: string;
}

export function buildFermentationLeftoverRows(range: ReportDateRange): FermentationLeftoverRow[] {
  const rows = queryAll<{
    id: number;
    batch_number: string;
    recipe_name: string | null;
    fermenter_name: string;
    volume_gal: number;
    discarded_date: string;
    notes: string;
    changed_by: string | null;
  }>(`
    SELECT d.id, d.batch_number, m.recipe_name, d.fermenter_name, d.volume_gal,
           d.discarded_date, d.notes, d.changed_by
    FROM discarded_fermentations d
    LEFT JOIN mash_batches m ON m.id = d.mash_batch_id
    ORDER BY d.discarded_date DESC, d.id DESC
  `);

  return rows
    .filter((row) => eventInReportRange(row.discarded_date, range))
    .map((row) => ({
      key: `leftover-${row.id}`,
      batch_number: row.batch_number || '—',
      recipe_name: row.recipe_name || 'Wash',
      fermenter_name: row.fermenter_name || '—',
      volume_gal: row.volume_gal,
      discarded_date: row.discarded_date,
      notes: row.notes?.trim() || '—',
      who: row.changed_by?.trim() || '—',
    }));
}
