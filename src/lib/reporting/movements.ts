import { queryAll } from '../../db/database';
import { laaGalFromVolumeAbv } from './alcohol-units';
import { eventInReportRange, type ReportDateRange } from './period';

export type LiquidMovementType =
  | 'distillation_cut'
  | 'still_charge'
  | 'tank_transfer'
  | 'blend_output'
  | 'blend_draw'
  | 'bottling'
  | 'barrel_fill';

export interface LiquidMovementRow {
  row_key: string;
  occurred_at: string;
  movement_type: LiquidMovementType;
  source_label: string;
  dest_label: string;
  product_liquid: string;
  batch_ref: string;
  volume_gal: number;
  abv: number;
  laa_gal: number;
  user_label: string;
  reference: string;
  notes: string;
}

const BLEND_LEDGER = "('executed', 'bottled', 'blended')";

export function buildLiquidMovements(range: ReportDateRange): LiquidMovementRow[] {
  const rows: LiquidMovementRow[] = [];

  const cuts = queryAll<{
    id: number;
    occurred_at: string;
    cut_type: string;
    volume_gal: number;
    abv: number;
    batch_number: string;
    still_name: string;
    tank_name: string | null;
    operator: string;
  }>(`
    SELECT c.id, c.start_time as occurred_at, c.cut_type, c.volume_gal, c.abv,
           r.batch_number, r.still_name, fe.name as tank_name, r.assigned_user_name as operator
    FROM distillation_cuts c
    JOIN distillation_runs r ON r.id = c.distillation_run_id
    LEFT JOIN floor_equipment fe ON fe.id = c.holding_tank_equipment_id
    WHERE c.volume_gal > 0
  `);
  for (const c of cuts) {
    if (!eventInReportRange(c.occurred_at, range)) continue;
    rows.push({
      row_key: `cut:${c.id}`,
      occurred_at: c.occurred_at,
      movement_type: 'distillation_cut',
      source_label: c.still_name,
      dest_label: c.tank_name ?? (c.cut_type === 'heads' ? 'Discarded' : '—'),
      product_liquid: c.cut_type,
      batch_ref: c.batch_number,
      volume_gal: c.volume_gal,
      abv: c.abv,
      laa_gal: laaGalFromVolumeAbv(c.volume_gal, c.abv),
      user_label: c.operator || '—',
      reference: `Cut ${c.id}`,
      notes: '',
    });
  }

  const charges = queryAll<{
    id: number;
    run_date: string;
    batch_number: string;
    still_name: string;
    tank_name: string | null;
    charge_volume_gal: number;
    charge_abv: number | null;
    operator: string;
  }>(`
    SELECT r.id, r.run_date, r.batch_number, r.still_name, src.name as tank_name,
           r.charge_volume_gal, r.charge_abv, r.assigned_user_name as operator
    FROM distillation_runs r
    LEFT JOIN floor_equipment src ON src.id = r.source_holding_tank_equipment_id
    WHERE r.source_holding_tank_equipment_id IS NOT NULL AND r.charge_volume_gal > 0
  `);
  for (const r of charges) {
    if (!eventInReportRange(r.run_date, range)) continue;
    const abv = r.charge_abv ?? 0;
    rows.push({
      row_key: `charge:${r.id}`,
      occurred_at: r.run_date,
      movement_type: 'still_charge',
      source_label: r.tank_name ?? 'Tank',
      dest_label: r.still_name,
      product_liquid: 'Charge',
      batch_ref: r.batch_number,
      volume_gal: r.charge_volume_gal,
      abv,
      laa_gal: laaGalFromVolumeAbv(r.charge_volume_gal, abv),
      user_label: r.operator || '—',
      reference: `Run ${r.id}`,
      notes: '',
    });
  }

  const transfers = queryAll<{
    id: number;
    occurred_at: string;
    spirit_type: string;
    volume_gal: number;
    abv: number;
    source_name: string;
    dest_name: string;
  }>(`
    SELECT t.id, COALESCE(t.created_at, t.transfer_date) as occurred_at, t.spirit_type,
           t.volume_gal, t.abv, src.name as source_name, dest.name as dest_name
    FROM holding_tank_transfers t
    JOIN floor_equipment src ON src.id = t.source_tank_equipment_id
    JOIN floor_equipment dest ON dest.id = t.dest_tank_equipment_id
    WHERE t.volume_gal > 0
  `);
  for (const t of transfers) {
    if (!eventInReportRange(t.occurred_at, range)) continue;
    rows.push({
      row_key: `transfer:${t.id}`,
      occurred_at: t.occurred_at,
      movement_type: 'tank_transfer',
      source_label: t.source_name,
      dest_label: t.dest_name,
      product_liquid: t.spirit_type.replace(/_/g, ' '),
      batch_ref: '',
      volume_gal: t.volume_gal,
      abv: t.abv,
      laa_gal: laaGalFromVolumeAbv(t.volume_gal, t.abv),
      user_label: '—',
      reference: `Transfer ${t.id}`,
      notes: '',
    });
  }

  const blendOut = queryAll<{
    id: number;
    occurred_at: string;
    batch_number: string;
    product_name: string;
    volume_gal: number;
    abv: number;
    tank_name: string | null;
    operator: string;
    status: string;
  }>(`
    SELECT b.id, COALESCE(b.executed_at, b.created_at) as occurred_at, b.batch_number,
           b.product_name, b.final_volume_gal as volume_gal, b.final_abv as abv,
           out_fe.name as tank_name, b.assigned_user_name as operator, b.status
    FROM blend_products b
    LEFT JOIN floor_equipment out_fe ON out_fe.id = b.output_holding_tank_equipment_id
    WHERE b.status IN ${BLEND_LEDGER} AND b.final_volume_gal > 0
  `);
  for (const b of blendOut) {
    if (!eventInReportRange(b.occurred_at, range)) continue;
    rows.push({
      row_key: `blend_out:${b.id}`,
      occurred_at: b.occurred_at,
      movement_type: 'blend_output',
      source_label: `Blend ${b.batch_number}`,
      dest_label: b.tank_name ?? 'Output tank',
      product_liquid: b.product_name,
      batch_ref: b.batch_number,
      volume_gal: b.volume_gal,
      abv: b.abv,
      laa_gal: laaGalFromVolumeAbv(b.volume_gal, b.abv),
      user_label: b.operator || '—',
      reference: `Blend ${b.id}`,
      notes: b.status !== 'executed' ? `Status: ${b.status}` : '',
    });
  }

  const blendDraws = queryAll<{
    id: number;
    blend_id: number;
    occurred_at: string;
    batch_number: string;
    product_name: string;
    volume_gal: number;
    abv: number;
    source_label: string;
    operator: string;
  }>(`
    SELECT bss.id, b.id as blend_id, COALESCE(b.executed_at, b.blend_date) as occurred_at,
           b.batch_number, b.product_name, bss.volume_gal, bss.abv,
           COALESCE(fe.name, bar.barrel_number, 'Source') as source_label,
           b.assigned_user_name as operator
    FROM blend_spirit_sources bss
    JOIN blend_products b ON b.id = bss.blend_product_id
    LEFT JOIN floor_equipment fe ON fe.id = bss.holding_tank_equipment_id
    LEFT JOIN barrels bar ON bar.id = bss.barrel_id
    WHERE b.status IN ${BLEND_LEDGER} AND bss.volume_gal > 0
  `);
  for (const d of blendDraws) {
    if (!eventInReportRange(d.occurred_at, range)) continue;
    rows.push({
      row_key: `blend_draw:${d.id}`,
      occurred_at: d.occurred_at,
      movement_type: 'blend_draw',
      source_label: d.source_label,
      dest_label: `Blend ${d.batch_number}`,
      product_liquid: d.product_name,
      batch_ref: d.batch_number,
      volume_gal: d.volume_gal,
      abv: d.abv,
      laa_gal: laaGalFromVolumeAbv(d.volume_gal, d.abv),
      user_label: d.operator || '—',
      reference: `Blend source ${d.id}`,
      notes: '',
    });
  }

  const bottlings = queryAll<{
    id: number;
    bottling_date: string;
    batch_number: string;
    product_name: string;
    source_volume_gal: number | null;
    final_abv: number;
    tank_name: string | null;
  }>(`
    SELECT br.id, br.bottling_date, br.batch_number, br.product_name,
           br.source_volume_gal, br.final_abv, fe.name as tank_name
    FROM bottling_runs br
    LEFT JOIN floor_equipment fe ON fe.id = br.source_holding_tank_equipment_id
    WHERE br.source_holding_tank_equipment_id IS NOT NULL AND br.source_volume_gal > 0
  `);
  for (const b of bottlings) {
    if (!eventInReportRange(b.bottling_date, range)) continue;
    const vol = b.source_volume_gal ?? 0;
    rows.push({
      row_key: `bottle:${b.id}`,
      occurred_at: b.bottling_date,
      movement_type: 'bottling',
      source_label: b.tank_name ?? 'Tank',
      dest_label: 'Bottling',
      product_liquid: b.product_name,
      batch_ref: b.batch_number,
      volume_gal: vol,
      abv: b.final_abv,
      laa_gal: laaGalFromVolumeAbv(vol, b.final_abv),
      user_label: '—',
      reference: `Bottling ${b.id}`,
      notes: '',
    });
  }

  const barrelFills = queryAll<{
    id: number;
    fill_date: string;
    volume_gal: number;
    abv: number;
    tank_name: string;
    barrel_number: string;
  }>(`
    SELECT bf.id, bf.fill_date, bf.volume_gal, bf.abv, fe.name as tank_name, b.barrel_number
    FROM barrel_fills bf
    JOIN floor_equipment fe ON fe.id = bf.source_holding_tank_equipment_id
    JOIN barrels b ON b.id = bf.barrel_id
    WHERE bf.volume_gal > 0
  `);
  for (const f of barrelFills) {
    if (!eventInReportRange(f.fill_date, range)) continue;
    rows.push({
      row_key: `barrel_fill:${f.id}`,
      occurred_at: f.fill_date,
      movement_type: 'barrel_fill',
      source_label: f.tank_name,
      dest_label: f.barrel_number,
      product_liquid: 'Barrel fill',
      batch_ref: f.barrel_number,
      volume_gal: f.volume_gal,
      abv: f.abv,
      laa_gal: laaGalFromVolumeAbv(f.volume_gal, f.abv),
      user_label: '—',
      reference: `Barrel fill ${f.id}`,
      notes: '',
    });
  }

  rows.sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  return rows;
}
