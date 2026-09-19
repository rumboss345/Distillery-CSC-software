import { getBlendProducts, getBlendSpiritSources } from '../../db/queries';
import { laaGalFromVolumeAbv, roundVolume, safePercent } from './alcohol-units';
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
  volume_variance_pct: number | null;
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
    const volVarPct =
      theoVol != null && theoVol > 0
        ? safePercent(finalVol - theoVol, theoVol)
        : null;

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
      volume_variance_pct: volVarPct,
      output_tank: b.output_tank_name ?? '—',
      operator: b.assigned_user_name?.trim() || '—',
    });
  }

  rows.sort(
    (a, b) =>
      new Date(b.executed_at ?? b.blend_date).getTime()
      - new Date(a.executed_at ?? a.blend_date).getTime(),
  );
  return rows;
}
