import { queryAll } from '../../db/database';
import { getBlendProducts, getBottlingRuns, getHoldingTankVolumeVariances } from '../../db/queries';
import { compareStoredDatesDesc } from '../date-input';
import { formatDistillationLossGal } from '../distillation-loss';
import { formatTankVolumeVariance, tankReadingChanged } from '../tank-volume-variance';
import { buildBlendReportRows } from './blend-rows';
import { buildDistillationReportRows } from './distillation-rows';
import { eventInReportRange, type ReportDateRange } from './period';

export interface VolumeChangeRow {
  key: string;
  occurred_at: string;
  kind: string;
  place: string;
  change: string;
  why: string;
  who: string;
}

function shown(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || '—';
}

export function buildVolumeChangeRows(range: ReportDateRange): VolumeChangeRow[] {
  const rows: VolumeChangeRow[] = [];

  const leftovers = queryAll<{
    id: number;
    batch_number: string;
    fermenter_name: string;
    volume_gal: number;
    discarded_date: string;
    notes: string;
    changed_by: string | null;
  }>(`
    SELECT id, batch_number, fermenter_name, volume_gal, discarded_date, notes, changed_by
    FROM discarded_fermentations
  `);
  for (const row of leftovers) {
    if (!eventInReportRange(row.discarded_date, range)) continue;
    rows.push({
      key: `leftover:${row.id}`,
      occurred_at: row.discarded_date,
      kind: 'Fermenter leftovers',
      place: row.fermenter_name || 'Fermenter',
      change: `${row.volume_gal.toFixed(1)} gal from ${row.batch_number || 'wash'}`,
      why: shown(row.notes),
      who: shown(row.changed_by),
    });
  }

  for (const variance of getHoldingTankVolumeVariances()) {
    if (!eventInReportRange(variance.recorded_at, range)) continue;
    const readingChanged = tankReadingChanged(
      variance.book_volume_gal,
      variance.set_volume_gal,
      variance.book_abv,
      variance.set_abv,
    );
    const cleared = variance.notes.toLowerCase().includes('on-hand reading removed');
    if (!readingChanged && !cleared) continue;
    const abvMoved = Math.abs(variance.set_abv - variance.book_abv) >= 0.05;
    const abvNote = abvMoved
      ? `, ABV ${variance.book_abv.toFixed(1)}% to ${variance.set_abv.toFixed(1)}%`
      : '';
    rows.push({
      key: `set:${variance.id}`,
      occurred_at: variance.recorded_at,
      kind: 'Set volume',
      place: variance.tank_name,
      change: `${variance.book_volume_gal.toFixed(2)} gal to ${variance.set_volume_gal.toFixed(2)} gal (${formatTankVolumeVariance(variance.variance_gal)})${abvNote}`,
      why: shown(variance.notes),
      who: shown(variance.changed_by),
    });
  }

  for (const run of getBottlingRuns()) {
    if (!eventInReportRange(run.bottling_date, range)) continue;
    const variance = run.volume_variance_gal;
    if (variance == null || Math.abs(variance) < 0.01) continue;
    rows.push({
      key: `bottling:${run.id}`,
      occurred_at: run.bottling_date,
      kind: 'Bottling variance',
      place: run.batch_number,
      change: `${variance > 0 ? '+' : ''}${variance.toFixed(2)} gal vs the tank (${run.product_name})`,
      why: shown(run.variance_reason),
      who: shown(run.variance_changed_by),
    });
  }

  const blendNotes = new Map(getBlendProducts().map((product) => [product.id, product.notes]));
  for (const blend of buildBlendReportRows(range)) {
    const abvDelta = blend.theoretical_abv != null ? blend.final_abv - blend.theoretical_abv : null;
    const volumeMoved = blend.volume_variance_pct != null && Math.abs(blend.volume_variance_pct) >= 0.1;
    const abvMoved = abvDelta != null && Math.abs(abvDelta) >= 0.1;
    if (!volumeMoved && !abvMoved) continue;
    const parts: string[] = [];
    if (volumeMoved && blend.volume_variance_pct != null) {
      parts.push(`volume ${blend.volume_variance_pct > 0 ? '+' : ''}${blend.volume_variance_pct.toFixed(1)}% vs theoretical`);
    }
    if (abvMoved && blend.theoretical_abv != null) {
      parts.push(`ABV ${blend.theoretical_abv.toFixed(1)}% to ${blend.final_abv.toFixed(1)}%`);
    }
    rows.push({
      key: `blend:${blend.blend_id}`,
      occurred_at: blend.executed_at ?? blend.blend_date,
      kind: 'Blend volume',
      place: blend.output_tank === '—' ? blend.batch_number : `${blend.batch_number} · ${blend.output_tank}`,
      change: parts.join('; '),
      why: shown(blendNotes.get(blend.blend_id)),
      who: shown(blend.operator === '—' ? '' : blend.operator),
    });
  }

  for (const run of buildDistillationReportRows(range)) {
    if (run.alcohol_loss_gal == null || Math.abs(run.alcohol_loss_gal) < 0.01) continue;
    const why = run.alcohol_charge_basis === 'estimated_brix'
      ? 'Collected alcohol compared with the wash alcohol estimated from Brix'
      : run.alcohol_charge_basis === 'proofed_spirit'
        ? 'Collected alcohol compared with the spirit charged'
        : 'Collected alcohol compared with the alcohol charged';
    rows.push({
      key: `distillation:${run.run_id}`,
      occurred_at: run.run_date,
      kind: 'Distillation loss',
      place: run.batch_number,
      change: `Loss ${formatDistillationLossGal(run.alcohol_loss_gal)} alcohol (${(run.alcohol_charged_gal ?? 0).toFixed(2)} gal charged, ${(run.alcohol_collected_gal ?? 0).toFixed(2)} gal collected)`,
      why,
      who: shown(run.operator === '—' ? '' : run.operator),
    });
  }

  rows.sort((a, b) => compareStoredDatesDesc(a.occurred_at, b.occurred_at));
  return rows;
}
