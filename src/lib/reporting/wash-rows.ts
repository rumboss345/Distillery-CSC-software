import { queryAll } from '../../db/database';
import { eventInReportRange, type ReportDateRange } from './period';

export interface WashHistoryRow {
  key: string;
  batch_number: string;
  recipe_name: string;
  sugar_lbs: number;
  volume_gal: number;
  start_date: string;
  status: string;
  operator: string;
}

/** Discarded washes that never entered fermentation. Those stay on the Wash page's history. */
export function buildWashHistoryRows(range: ReportDateRange): WashHistoryRow[] {
  const rows = queryAll<{
    id: number;
    batch_number: string;
    recipe_name: string;
    grain_lbs: number;
    water_gal: number;
    start_date: string;
    status: string;
    assigned_user_name: string | null;
  }>(`
    SELECT m.id, m.batch_number, m.recipe_name, m.grain_lbs, m.water_gal,
           m.start_date, m.status, m.assigned_user_name
    FROM mash_batches m
    WHERE m.status = 'discarded'
      AND NOT EXISTS (
        SELECT 1 FROM mash_fermenter_assignments a WHERE a.mash_batch_id = m.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM fermentation_logs fl WHERE fl.mash_batch_id = m.id
      )
    ORDER BY m.start_date DESC, m.id DESC
  `);

  return rows
    .filter((row) => eventInReportRange(row.start_date, range))
    .map((row) => ({
      key: `wash-${row.id}`,
      batch_number: row.batch_number,
      recipe_name: row.recipe_name || 'Wash',
      sugar_lbs: row.grain_lbs,
      volume_gal: row.water_gal,
      start_date: row.start_date,
      status: row.status,
      operator: row.assigned_user_name?.trim() || '—',
    }));
}
