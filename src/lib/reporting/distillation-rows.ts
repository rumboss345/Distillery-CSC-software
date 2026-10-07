import { queryAll } from '../../db/database';
import { distillationAlcoholBalance, washChargeAbvFromBrix, type AlcoholChargeBasis } from '../distillation-loss';
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
  alcohol_charged_gal: number | null;
  alcohol_collected_gal: number | null;
  alcohol_loss_gal: number | null;
  alcohol_charge_basis: AlcoholChargeBasis | null;
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
    proof_spirit_gal: number | null;
    proof_spirit_abv: number | null;
    proof_water_gal: number | null;
    alcohol_charged_gal: number | null;
    alcohol_collected_gal: number | null;
    alcohol_loss_gal: number | null;
    alcohol_charge_basis: AlcoholChargeBasis | null;
    assigned_user_name: string | null;
    notes: string;
    fermenter_name: string | null;
    source_tank_name: string | null;
    mash_batch: string | null;
    source_mash_batch_id: number | null;
    source_fermenter_equipment_id: number | null;
    start_brix: number | null;
    final_brix: number | null;
  }>(`
    SELECT r.id, r.batch_number, r.run_date, r.still_name, r.run_type, r.status,
           r.charge_volume_gal, r.charge_abv, r.proof_spirit_gal, r.proof_spirit_abv, r.proof_water_gal,
           r.alcohol_charged_gal, r.alcohol_collected_gal, r.alcohol_loss_gal, r.alcohol_charge_basis,
           r.assigned_user_name, r.notes, r.source_mash_batch_id, r.source_fermenter_equipment_id,
           fe.name as fermenter_name, src.name as source_tank_name, m.batch_number as mash_batch,
           COALESCE(m.actual_brix, m.target_brix) as start_brix, m.actual_final_brix as final_brix
    FROM distillation_runs r
    LEFT JOIN floor_equipment fe ON fe.id = r.source_fermenter_equipment_id
    LEFT JOIN floor_equipment src ON src.id = r.source_holding_tank_equipment_id
    LEFT JOIN mash_batches m ON m.id = r.source_mash_batch_id
    ORDER BY r.run_date DESC, r.id DESC
  `);

  const latestBrix = new Map<string, number>();
  const brixLogs = queryAll<{ mash_batch_id: number; floor_equipment_id: number | null; brix: number }>(`
    SELECT mash_batch_id, floor_equipment_id, brix
    FROM fermentation_logs
    WHERE brix IS NOT NULL
    ORDER BY logged_at DESC, id DESC
  `);
  for (const log of brixLogs) {
    const key = `${log.mash_batch_id}:${log.floor_equipment_id ?? ''}`;
    if (!latestBrix.has(key)) latestBrix.set(key, log.brix);
  }

  const collectedByRun = new Map<number, number>();
  const collectedRows = queryAll<{ distillation_run_id: number; collected_gal: number }>(`
    SELECT distillation_run_id, SUM(volume_gal * abv / 100.0) as collected_gal
    FROM distillation_cuts
    GROUP BY distillation_run_id
  `);
  for (const row of collectedRows) {
    collectedByRun.set(row.distillation_run_id, row.collected_gal);
  }

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
    const hasCuts = collectedByRun.has(r.id);
    const recorded = hasCuts && (r.alcohol_charged_gal != null || r.alcohol_loss_gal != null);
    const currentBrix = r.source_mash_batch_id == null
      ? null
      : latestBrix.get(`${r.source_mash_batch_id}:${r.source_fermenter_equipment_id ?? ''}`)
        ?? latestBrix.get(`${r.source_mash_batch_id}:`)
        ?? r.final_brix;
    const estimatedAbv = r.charge_abv == null
      ? washChargeAbvFromBrix(r.start_brix, currentBrix)
      : null;
    const live = distillationAlcoholBalance({
      chargeVolumeGal: r.charge_volume_gal,
      chargeAbv: r.charge_abv ?? estimatedAbv,
      proofSpiritGal: r.proof_spirit_gal,
      proofSpiritAbv: r.proof_spirit_abv,
      proofWaterGal: r.proof_water_gal,
      estimatedFromBrix: r.charge_abv == null && estimatedAbv != null,
      cuts: [{ volume_gal: collectedByRun.get(r.id) ?? 0, abv: 100 }],
    });
    const alcoholCharged = !hasCuts ? null : (recorded ? r.alcohol_charged_gal : live.chargedGal);
    const alcoholCollected = !hasCuts ? null : (recorded ? r.alcohol_collected_gal : live.collectedGal);
    const alcoholLoss = !hasCuts ? null : (recorded ? r.alcohol_loss_gal : live.lossGal);
    const alcoholBasis = !hasCuts ? null : (recorded ? r.alcohol_charge_basis : (live.basis === 'unknown' ? null : live.basis));

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
      alcohol_charged_gal: alcoholCharged,
      alcohol_collected_gal: alcoholCollected,
      alcohol_loss_gal: alcoholLoss,
      alcohol_charge_basis: alcoholBasis,
      operator: r.assigned_user_name?.trim() || '—',
      notes: r.notes?.trim() || '',
    });
  }
  return rows;
}
