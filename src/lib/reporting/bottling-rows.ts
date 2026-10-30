import { getBottlingRuns } from '../../db/queries';
import { compareStoredDatesDesc } from '../date-input';
import { bottleSizeCounts, formatBottleSizes, reportedBottlingAlcoholVarianceGal, reportedBottlingVarianceGal, totalVolumeGal, type BottleSizeCount } from '../bottling-lines';
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
  bottle_sizes: BottleSizeCount[];
  packaging_summary: string;
  volume_variance_gal: number | null;
  alcohol_variance_gal: number | null;
  variance_reason: string | null;
  variance_changed_by: string | null;
}

export function buildBottlingReportRows(range: ReportDateRange): BottlingReportRow[] {
  const runs = getBottlingRuns();
  const rows: BottlingReportRow[] = [];

  for (const run of runs) {
    if (run.status === 'planned') continue;
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
      bottle_sizes: bottleSizeCounts(run.lines),
      packaging_summary: formatBottleSizes(run.lines),
      volume_variance_gal: reportedBottlingVarianceGal(run),
      alcohol_variance_gal: reportedBottlingAlcoholVarianceGal(run),
      variance_reason: run.variance_reason?.trim() || null,
      variance_changed_by: run.variance_changed_by?.trim() || null,
    });
  }

  rows.sort((a, b) => compareStoredDatesDesc(a.bottling_date, b.bottling_date));
  return rows;
}
