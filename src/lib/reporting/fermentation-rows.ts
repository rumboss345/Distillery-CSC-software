import { queryAll } from '../../db/database';
import { eventInReportRange, type ReportDateRange } from './period';

export interface FermentationHistoryRow {
  key: string;
  batch_number: string;
  recipe_name: string;
  fermenter_name: string;
  volume_gal: number | null;
  start_date: string;
  start_brix: number | null;
  status: string;
  operator: string;
}

export function buildFermentationHistoryRows(range: ReportDateRange): FermentationHistoryRow[] {
  const rows = queryAll<{
    mash_id: number;
    assignment_id: number | null;
    batch_number: string;
    recipe_name: string;
    fermenter_name: string | null;
    volume_gal: number | null;
    start_date: string;
    actual_brix: number | null;
    row_status: string;
    assigned_user_name: string | null;
  }>(`
    SELECT m.id as mash_id, a.id as assignment_id, m.batch_number, m.recipe_name,
           fe.name as fermenter_name, a.volume_gal, m.start_date, m.actual_brix,
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

  return rows
    .filter((row) => eventInReportRange(row.start_date, range))
    .map((row) => ({
      key: row.assignment_id != null ? `assign-${row.assignment_id}` : `batch-${row.mash_id}`,
      batch_number: row.batch_number,
      recipe_name: row.recipe_name || 'Wash',
      fermenter_name: row.fermenter_name || 'Not assigned',
      volume_gal: row.volume_gal,
      start_date: row.start_date,
      start_brix: row.actual_brix,
      status: row.row_status,
      operator: row.assigned_user_name?.trim() || '—',
    }));
}

export interface FermentationLeftoverRow {
  key: string;
  batch_number: string;
  recipe_name: string;
  fermenter_name: string;
  volume_gal: number;
  discarded_date: string;
  notes: string;
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
  }>(`
    SELECT d.id, d.batch_number, m.recipe_name, d.fermenter_name, d.volume_gal,
           d.discarded_date, d.notes
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
      notes: row.notes?.trim() || 'Leftovers',
    }));
}
