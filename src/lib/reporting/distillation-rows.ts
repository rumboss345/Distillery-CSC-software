import { queryAll } from '../../db/database';
import { laaGalFromVolumeAbv, roundVolume } from './alcohol-units';
import { eventInReportRange, type ReportDateRange } from './period';

export interface DistillationReportRow {
  run_id: number;
  batch_number: string;
  run_date: string;
  still_name: string;
  run_type: string;
  status: string;
  source_label: string;
  charge_volume_gal: number;
  charge_abv: number | null;
  heads_gal: number;
  hearts_gal: number;
  tails_gal: number;
  other_gal: number;
  total_cut_gal: number;
  hearts_laa_gal: number;
  operator: string;
  notes: string;
}

export function buildDistillationReportRows(range: ReportDateRange): DistillationReportRow[] {
  const runs = queryAll<{
    id: number;
    batch_number: string;
    run_date: string;
    still_name: string;
    run_type: string;
    status: string;
    charge_volume_gal: number;
    charge_abv: number | null;
    assigned_user_name: string | null;
    notes: string;
    fermenter_name: string | null;
    source_tank_name: string | null;
    mash_batch: string | null;
  }>(`
    SELECT r.id, r.batch_number, r.run_date, r.still_name, r.run_type, r.status,
           r.charge_volume_gal, r.charge_abv, r.assigned_user_name, r.notes,
           fe.name as fermenter_name, src.name as source_tank_name, m.batch_number as mash_batch
    FROM distillation_runs r
    LEFT JOIN floor_equipment fe ON fe.id = r.source_fermenter_equipment_id
    LEFT JOIN floor_equipment src ON src.id = r.source_holding_tank_equipment_id
    LEFT JOIN mash_batches m ON m.id = r.source_mash_batch_id
    ORDER BY r.run_date DESC, r.id DESC
  `);

  const cutTotals = queryAll<{
    distillation_run_id: number;
    cut_type: string;
    volume_gal: number;
    abv: number;
  }>(`
    SELECT distillation_run_id, cut_type, SUM(volume_gal) as volume_gal, AVG(abv) as abv
    FROM distillation_cuts
    GROUP BY distillation_run_id, cut_type
  `);

  const cutsByRun = new Map<number, Map<string, { vol: number; abv: number }>>();
  for (const c of cutTotals) {
    let byType = cutsByRun.get(c.distillation_run_id);
    if (!byType) {
      byType = new Map();
      cutsByRun.set(c.distillation_run_id, byType);
    }
    byType.set(c.cut_type, { vol: c.volume_gal, abv: c.abv });
  }

  const rows: DistillationReportRow[] = [];
  for (const r of runs) {
    if (!eventInReportRange(r.run_date, range)) continue;

    const byType = cutsByRun.get(r.id) ?? new Map();
    const heads = byType.get('heads')?.vol ?? 0;
    const hearts = byType.get('hearts')?.vol ?? 0;
    const tails = byType.get('tails')?.vol ?? 0;
    let other = 0;
    for (const [type, v] of byType) {
      if (type !== 'heads' && type !== 'hearts' && type !== 'tails') {
        other += v.vol;
      }
    }
    const heartsAbv = byType.get('hearts')?.abv ?? 0;
    const totalCut = heads + hearts + tails + other;

    const sourceLabel =
      r.source_tank_name
      ?? r.fermenter_name
      ?? (r.mash_batch ? `Wash ${r.mash_batch}` : '—');

    rows.push({
      run_id: r.id,
      batch_number: r.batch_number,
      run_date: r.run_date,
      still_name: r.still_name,
      run_type: r.run_type.replace(/_/g, ' '),
      status: r.status,
      source_label: sourceLabel,
      charge_volume_gal: r.charge_volume_gal,
      charge_abv: r.charge_abv,
      heads_gal: roundVolume(heads),
      hearts_gal: roundVolume(hearts),
      tails_gal: roundVolume(tails),
      other_gal: roundVolume(other),
      total_cut_gal: roundVolume(totalCut),
      hearts_laa_gal: laaGalFromVolumeAbv(hearts, heartsAbv),
      operator: r.assigned_user_name?.trim() || '—',
      notes: r.notes?.trim() || '',
    });
  }
  return rows;
}
