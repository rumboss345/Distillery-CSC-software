import { queryAll } from '../../db/database';
import { getMonthlyProduction } from '../../db/queries';
import type { MonthlyProduction } from './productivity';
import { reportPersonMatches, type ReportEmployee } from './person';

interface PersonMonth {
  month: string | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
}

function matches(row: { assigned_user_name: string | null; assigned_user_id: number | null }, employee: ReportEmployee): boolean {
  return reportPersonMatches(row.assigned_user_name, employee, row.assigned_user_id);
}

function bucket(byMonth: Map<string, MonthlyProduction>, month: string | null): MonthlyProduction | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const existing = byMonth.get(month);
  if (existing) return existing;
  const created: MonthlyProduction = {
    month,
    heartsGal: 0,
    pureAlcoholGal: 0,
    bottles: 0,
    runs: 0,
    fermentations: 0,
  };
  byMonth.set(month, created);
  return created;
}

/**
 * Month totals for the productivity chart.
 * With no employee selected this is the same chart as before.
 * With an employee selected, only that person's washes, runs, and bottling notes are counted.
 */
export function monthlyProductionForEmployee(employee: ReportEmployee | null): MonthlyProduction[] {
  if (!employee) return getMonthlyProduction();

  const byMonth = new Map<string, MonthlyProduction>();

  const hearts = queryAll<PersonMonth & { volume_gal: number; abv: number }>(`
    SELECT
      strftime('%Y-%m', r.run_date) as month,
      c.volume_gal,
      c.abv,
      r.assigned_user_id,
      r.assigned_user_name
    FROM distillation_cuts c
    JOIN distillation_runs r ON r.id = c.distillation_run_id
    WHERE c.cut_type = 'hearts'
      AND r.status IN ('running', 'complete')
  `);
  for (const row of hearts) {
    if (!matches(row, employee)) continue;
    const month = bucket(byMonth, row.month);
    if (!month) continue;
    month.heartsGal += row.volume_gal;
    month.pureAlcoholGal += row.volume_gal * row.abv / 100;
  }

  const runs = queryAll<PersonMonth>(`
    SELECT strftime('%Y-%m', run_date) as month, assigned_user_id, assigned_user_name
    FROM distillation_runs
    WHERE status = 'complete'
  `);
  for (const row of runs) {
    if (!matches(row, employee)) continue;
    const month = bucket(byMonth, row.month);
    if (!month) continue;
    month.runs += 1;
  }

  const bottles = queryAll<{ month: string | null; bottles: number; variance_changed_by: string | null }>(`
    SELECT
      strftime('%Y-%m', r.bottling_date) as month,
      r.variance_changed_by,
      CASE
        WHEN COALESCE((
          SELECT SUM(l.bottle_count) FROM bottling_run_lines l WHERE l.bottling_run_id = r.id
        ), 0) > 0
        THEN (
          SELECT SUM(l.bottle_count) FROM bottling_run_lines l WHERE l.bottling_run_id = r.id
        )
        ELSE r.bottle_count
      END as bottles
    FROM bottling_runs r
  `);
  for (const row of bottles) {
    if (!reportPersonMatches(row.variance_changed_by, employee)) continue;
    const month = bucket(byMonth, row.month);
    if (!month) continue;
    month.bottles += row.bottles;
  }

  const fermentations = queryAll<PersonMonth>(`
    SELECT month, assigned_user_id, assigned_user_name
    FROM (
      SELECT
        strftime('%Y-%m', COALESCE(NULLIF(TRIM(m.fermentation_start_date), ''), m.start_date)) as month,
        m.assigned_user_id,
        m.assigned_user_name
      FROM mash_fermenter_assignments a
      JOIN mash_batches m ON m.id = a.mash_batch_id
      UNION ALL
      SELECT
        strftime('%Y-%m', COALESCE(NULLIF(TRIM(m.fermentation_start_date), ''), m.start_date)) as month,
        m.assigned_user_id,
        m.assigned_user_name
      FROM distillation_runs r
      JOIN mash_batches m ON m.id = r.source_mash_batch_id
      WHERE r.run_type IN ('wash', 'heavy_rum')
        AND r.source_fermenter_equipment_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM mash_fermenter_assignments a
          WHERE a.mash_batch_id = r.source_mash_batch_id
            AND a.floor_equipment_id = r.source_fermenter_equipment_id
        )
      GROUP BY m.id, r.source_fermenter_equipment_id, m.assigned_user_id, m.assigned_user_name
      UNION ALL
      SELECT
        strftime('%Y-%m', COALESCE(NULLIF(TRIM(m.fermentation_start_date), ''), m.start_date)) as month,
        m.assigned_user_id,
        m.assigned_user_name
      FROM mash_batches m
      WHERE m.status IN ('fermenting', 'complete', 'discarded')
        AND NOT EXISTS (
          SELECT 1 FROM mash_fermenter_assignments a WHERE a.mash_batch_id = m.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM distillation_runs r
          WHERE r.source_mash_batch_id = m.id
            AND r.source_fermenter_equipment_id IS NOT NULL
        )
    )
  `);
  for (const row of fermentations) {
    if (!matches(row, employee)) continue;
    const month = bucket(byMonth, row.month);
    if (!month) continue;
    month.fermentations += 1;
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}
