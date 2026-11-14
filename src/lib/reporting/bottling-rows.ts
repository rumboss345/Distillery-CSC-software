import { getBottlingRuns } from '../../db/queries';
import { compareStoredDatesDesc } from '../date-input';
import { bottleSizeCounts, bottlingSentToTankGal, formatBottleSizes, reportedBottlingAlcoholVarianceGal, reportedBottlingVarianceGal, totalVolumeGal, type BottleSizeCount } from '../bottling-lines';
import { laaGalFromVolumeAbv, roundAbv, roundVolume, safePercent } from './alcohol-units';
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
  /** Gallons drawn minus gallons sent to a tank: what should be in the bottles. Null when no tank draw was recorded. */
  expected_gal: number | null;
  bottled_gal: number;
  /** Bottled minus expected, as a percent of expected. */
  volume_variance_pct: number | null;
  /** ABV of the source tank when the run was saved. */
  source_abv: number | null;
  /** Planned bottling ABV. */
  final_abv: number;
  /** Hydrometer check of the bottled product, corrected to 60 °F. */
  measured_abv: number | null;
  /** Measured minus planned ABV, in percentage points. */
  abv_variance_points: number | null;
  operator: string;
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
    const tankDraw = run.source_holding_tank_equipment_id && run.source_volume_gal != null
      ? run.source_volume_gal
      : null;
    const expected = tankDraw != null ? Math.max(0, tankDraw - bottlingSentToTankGal(run)) : null;
    const measuredAbv = run.measured_abv != null && run.measured_abv > 0 ? run.measured_abv : null;
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
      expected_gal: expected != null ? roundVolume(expected) : null,
      bottled_gal: roundVolume(bottled),
      volume_variance_pct: expected != null && expected > 0 ? safePercent(bottled - expected, expected) : null,
      source_abv: run.source_abv ?? null,
      final_abv: run.final_abv,
      measured_abv: measuredAbv,
      abv_variance_points: measuredAbv != null && run.final_abv > 0 ? roundAbv(measuredAbv - run.final_abv) : null,
      operator: run.assigned_user_name?.trim() || run.variance_changed_by?.trim() || '—',
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
