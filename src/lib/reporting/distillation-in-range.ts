import { queryAll } from '../../db/database';
import { getDistillationRuns, getMashBatches } from '../../db/queries';
import type { YieldReport } from '../../types';
import { eventInReportRange, type ReportDateRange } from './period';

export function distillationRunIdsInRange(
  range: ReportDateRange,
  options?: { completeOnly?: boolean },
): number[] {
  return getDistillationRuns()
    .filter((run) => {
      if (options?.completeOnly && run.status !== 'complete') return false;
      return eventInReportRange(run.run_date, range);
    })
    .map((run) => run.id);
}

export function heartsGalInReportRange(range: ReportDateRange): number {
  const runIds = distillationRunIdsInRange(range);
  return sumHeartsGalForRuns(runIds);
}

export function gpaProducedInReportRange(range: ReportDateRange): number {
  const runIds = distillationRunIdsInRange(range);
  return sumHeartsGpaForRuns(runIds);
}

export function heartsGpaForMashInRange(mashBatchId: number, range: ReportDateRange): number {
  const runIds = getDistillationRuns()
    .filter(
      (run) => run.source_mash_batch_id === mashBatchId && eventInReportRange(run.run_date, range),
    )
    .map((run) => run.id);
  return sumHeartsGpaForRuns(runIds);
}

function sumHeartsGalForRuns(runIds: readonly number[]): number {
  if (runIds.length === 0) return 0;
  const placeholders = runIds.map(() => '?').join(',');
  const row = queryAll<{ total: number }>(
    `SELECT COALESCE(SUM(volume_gal), 0) as total FROM distillation_cuts
     WHERE cut_type = 'hearts' AND distillation_run_id IN (${placeholders})`,
    [...runIds],
  );
  return row[0]?.total ?? 0;
}

function sumHeartsGpaForRuns(runIds: readonly number[]): number {
  if (runIds.length === 0) return 0;
  const placeholders = runIds.map(() => '?').join(',');
  const row = queryAll<{ total: number }>(
    `SELECT COALESCE(SUM(volume_gal * abv / 100.0), 0) as total FROM distillation_cuts
     WHERE cut_type = 'hearts' AND distillation_run_id IN (${placeholders})`,
    [...runIds],
  );
  return row[0]?.total ?? 0;
}

/** Yield-style rows for the given distillation run ids (hearts aggregated per wash batch). */
export function yieldReportsForDistillationRunIds(runIds: readonly number[]): YieldReport[] {
  if (runIds.length === 0) return [];

  const placeholders = runIds.map(() => '?').join(',');
  const rows = queryAll<{
    mashBatchNumber: string;
    grainLbs: number;
    washVolumeGal: number;
    heartsVolumeGal: number;
    heartsAbv: number;
    gpa: number;
  }>(`
    SELECT
      m.batch_number as mashBatchNumber,
      m.grain_lbs as grainLbs,
      m.water_gal as washVolumeGal,
      COALESCE(SUM(CASE WHEN c.cut_type = 'hearts' THEN c.volume_gal ELSE 0 END), 0) as heartsVolumeGal,
      CASE
        WHEN COALESCE(SUM(CASE WHEN c.cut_type = 'hearts' THEN c.volume_gal ELSE 0 END), 0) > 0
        THEN COALESCE(SUM(CASE WHEN c.cut_type = 'hearts' THEN c.volume_gal * c.abv ELSE 0 END), 0)
          / SUM(CASE WHEN c.cut_type = 'hearts' THEN c.volume_gal ELSE 0 END)
        ELSE 0
      END as heartsAbv,
      COALESCE(SUM(CASE WHEN c.cut_type = 'hearts' THEN c.volume_gal * c.abv / 100.0 ELSE 0 END), 0) as gpa
    FROM distillation_runs r
    JOIN mash_batches m ON m.id = r.source_mash_batch_id
    LEFT JOIN distillation_cuts c ON c.distillation_run_id = r.id
    WHERE r.id IN (${placeholders})
    GROUP BY m.id
    HAVING heartsVolumeGal > 0
    ORDER BY MAX(r.run_date) DESC
  `, [...runIds]);

  return rows.map((row) => ({
    mashBatchNumber: row.mashBatchNumber,
    grainLbs: row.grainLbs,
    washVolumeGal: row.washVolumeGal,
    heartsVolumeGal: row.heartsVolumeGal,
    heartsAbv: row.heartsAbv,
    gpa: row.gpa,
    yieldPercent: row.grainLbs > 0
      ? Math.round((row.gpa / row.grainLbs) * 1000) / 10
      : 0,
  }));
}

/** Yield-style rows using only distillation runs that fall inside the report range. */
export function yieldReportsInRange(range: ReportDateRange): YieldReport[] {
  return yieldReportsForDistillationRunIds(distillationRunIdsInRange(range));
}

export function mashBatchNumbersWithRunsInRange(range: ReportDateRange): Set<string> {
  const mashes = getMashBatches();
  const idToBatch = new Map(mashes.map((m) => [m.id, m.batch_number]));
  const batchNumbers = new Set<string>();
  for (const run of getDistillationRuns()) {
    if (!eventInReportRange(run.run_date, range)) continue;
    if (run.source_mash_batch_id == null) continue;
    const batch = idToBatch.get(run.source_mash_batch_id);
    if (batch) batchNumbers.add(batch);
  }
  return batchNumbers;
}
