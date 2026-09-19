import { getBottlingRuns } from '../../db/queries';
import { totalVolumeGal } from '../bottling-lines';
import { laaGalFromVolumeAbv, roundVolume } from './alcohol-units';
import { eventInReportRange, type ReportDateRange } from './period';

export interface BottlingReportRow {
  bottling_id: number;
  batch_number: string;
  product_name: string;
  bottling_date: string;
  lot_number: string;
  source_type: string;
  source_label: string;
  tank_draw_gal: number | null;
  bottled_gal: number;
  final_abv: number;
  bottled_laa_gal: number;
  bottle_count: number;
  packaging_summary: string;
  volume_variance_gal: number | null;
}

function packagingSummary(lines: { packaging_bottle: string; bottle_count: number; bottle_size_ml: number }[]): string {
  if (lines.length === 0) return '—';
  return lines
    .map((l) => `${l.bottle_count}× ${l.packaging_bottle || 'bottle'} (${l.bottle_size_ml} ml)`)
    .join('; ');
}

export function buildBottlingReportRows(range: ReportDateRange): BottlingReportRow[] {
  const runs = getBottlingRuns();
  const rows: BottlingReportRow[] = [];

  for (const run of runs) {
    if (!eventInReportRange(run.bottling_date, range)) continue;

    const bottled = run.bottled_volume_gal ?? totalVolumeGal(run.lines);
    const sourceType = run.source_holding_tank_equipment_id
      ? 'Tank'
      : run.source_barrel_id
        ? 'Barrel'
        : run.source_run_id
          ? 'Distillation run'
          : 'Other';

    rows.push({
      bottling_id: run.id,
      batch_number: run.batch_number,
      product_name: run.product_name,
      bottling_date: run.bottling_date,
      lot_number: run.lot_number || '—',
      source_type: sourceType,
      source_label:
        sourceType === 'Tank'
          ? `Tank #${run.source_holding_tank_equipment_id}`
          : sourceType === 'Barrel'
            ? `Barrel #${run.source_barrel_id}`
            : '—',
      tank_draw_gal:
        run.source_holding_tank_equipment_id && run.source_volume_gal != null
          ? roundVolume(run.source_volume_gal)
          : null,
      bottled_gal: roundVolume(bottled),
      final_abv: run.final_abv,
      bottled_laa_gal: laaGalFromVolumeAbv(bottled, run.final_abv),
      bottle_count: run.lines.reduce((s, l) => s + l.bottle_count, 0) || run.bottle_count,
      packaging_summary: packagingSummary(run.lines),
      volume_variance_gal: run.volume_variance_gal,
    });
  }

  rows.sort(
    (a, b) => new Date(b.bottling_date).getTime() - new Date(a.bottling_date).getTime(),
  );
  return rows;
}
