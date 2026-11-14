import { getBlendProducts, getBlendSpiritSources } from '../../db/queries';
import { compareStoredDatesDesc } from '../date-input';
import { laaGalFromVolumeAbv, roundAbv, roundVolume, safePercent } from './alcohol-units';
import { eventInReportRange, type ReportDateRange } from './period';

export interface BlendReportRow {
  blend_id: number;
  batch_number: string;
  product_name: string;
  blend_date: string;
  executed_at: string | null;
  status: string;
  source_count: number;
  spirit_draw_gal: number;
  spirit_laa_gal: number;
  final_volume_gal: number;
  final_abv: number;
  final_laa_gal: number;
  theoretical_volume_gal: number | null;
  theoretical_abv: number | null;
  /** Measured finished volume when entered, else the recorded final volume. */
  actual_volume_gal: number;
  /** Actual minus planned (theoretical) volume. */
  volume_variance_gal: number | null;
  volume_variance_pct: number | null;
  /** Target ABV of the blend, else the planned (theoretical) ABV. */
  planned_abv: number | null;
  /** Measured ABV when entered, else the recorded final ABV. */
  measured_abv: number | null;
  abv_variance_points: number | null;
  output_tank: string;
  operator: string;
}

export function buildBlendReportRows(range: ReportDateRange): BlendReportRow[] {
  const products = getBlendProducts();
  const rows: BlendReportRow[] = [];

  for (const b of products) {
    const occurred = b.executed_at ?? b.blend_date ?? b.created_at;
    if (!eventInReportRange(occurred, range)) continue;
    if (b.status === 'draft' || b.status === 'trial' || b.status === 'approved') continue;

    const sources = getBlendSpiritSources(b.id);
    const spiritDraw = sources.reduce((s, src) => s + src.volume_gal, 0);
    const spiritLaa = sources.reduce(
      (s, src) => s + laaGalFromVolumeAbv(src.volume_gal, src.abv),
      0,
    );

    const finalVol = b.final_volume_gal ?? 0;
    const finalAbv = b.final_abv ?? 0;
    const theoVol = b.theoretical_volume_gal;
    const actualVol = b.actual_volume_gal != null && b.actual_volume_gal > 0 ? b.actual_volume_gal : finalVol;
    const volVarPct =
      theoVol != null && theoVol > 0
        ? safePercent(actualVol - theoVol, theoVol)
        : null;
    const plannedAbv = b.target_abv != null && b.target_abv > 0
      ? b.target_abv
      : b.theoretical_abv != null && b.theoretical_abv > 0 ? b.theoretical_abv : null;
    const measuredAbv = b.actual_abv != null && b.actual_abv > 0
      ? b.actual_abv
      : finalAbv > 0 ? finalAbv : null;

    rows.push({
      blend_id: b.id,
      batch_number: b.batch_number,
      product_name: b.product_name,
      blend_date: b.blend_date,
      executed_at: b.executed_at,
      status: b.status,
      source_count: sources.length,
      spirit_draw_gal: roundVolume(spiritDraw),
      spirit_laa_gal: spiritLaa,
      final_volume_gal: roundVolume(finalVol),
      final_abv: finalAbv,
      final_laa_gal: laaGalFromVolumeAbv(finalVol, finalAbv),
      theoretical_volume_gal: theoVol,
      theoretical_abv: b.theoretical_abv,
      actual_volume_gal: roundVolume(actualVol),
      volume_variance_gal: theoVol != null && theoVol > 0 ? roundVolume(actualVol - theoVol) : null,
      volume_variance_pct: volVarPct,
      planned_abv: plannedAbv,
      measured_abv: measuredAbv,
      abv_variance_points: plannedAbv != null && measuredAbv != null ? roundAbv(measuredAbv - plannedAbv) : null,
      output_tank: b.output_tank_name ?? '—',
      operator: b.assigned_user_name?.trim() || '—',
    });
  }

  rows.sort((a, b) => compareStoredDatesDesc(a.executed_at ?? a.blend_date, b.executed_at ?? b.blend_date));
  return rows;
}
