import { formatDistillationAlcoholResult } from '../distillation-loss';
import { buildDistillationReportRows, type DistillationReportRow } from './distillation-rows';
import { safePercent } from './alcohol-units';
import type { ReportDateRange } from './period';

export interface StillEfficiencyRow {
  run_type_key: string;
  run_type_label: string;
  completed_runs: number;
  /** Average hearts LAA ÷ alcohol charged, when charge is known. */
  avg_hearts_recovery_pct: number | null;
  total_alcohol_charged_gal: number;
  total_hearts_laa_gal: number;
  total_alcohol_loss_gal: number | null;
  net_loss_gain_label: string;
}

export function buildStillEfficiencyFromRows(rows: DistillationReportRow[]): StillEfficiencyRow[] {
  const completed = rows.filter((row) => row.status === 'complete');
  const byType = new Map<string, StillEfficiencyRow>();

  for (const row of completed) {
    const bucket = byType.get(row.run_type_key) ?? {
      run_type_key: row.run_type_key,
      run_type_label: row.run_type,
      completed_runs: 0,
      avg_hearts_recovery_pct: null,
      total_alcohol_charged_gal: 0,
      total_hearts_laa_gal: 0,
      total_alcohol_loss_gal: 0,
      net_loss_gain_label: '—',
    };
    bucket.completed_runs += 1;
    bucket.total_hearts_laa_gal += row.hearts_laa_gal;
    if (row.alcohol_charged_gal != null) {
      bucket.total_alcohol_charged_gal += row.alcohol_charged_gal;
    }
    if (row.alcohol_loss_gal != null) {
      bucket.total_alcohol_loss_gal = (bucket.total_alcohol_loss_gal ?? 0) + row.alcohol_loss_gal;
    }
    byType.set(row.run_type_key, bucket);
  }

  return [...byType.values()]
    .map((row) => {
      const recovery = row.total_alcohol_charged_gal > 0
        ? safePercent(row.total_hearts_laa_gal, row.total_alcohol_charged_gal)
        : null;
      const loss = row.total_alcohol_loss_gal;
      return {
        ...row,
        avg_hearts_recovery_pct: recovery,
        total_alcohol_charged_gal: Math.round(row.total_alcohol_charged_gal * 100) / 100,
        total_hearts_laa_gal: Math.round(row.total_hearts_laa_gal * 100) / 100,
        total_alcohol_loss_gal: loss != null ? Math.round(loss * 1000) / 1000 : null,
        net_loss_gain_label: loss != null ? formatDistillationAlcoholResult(loss) : '—',
      };
    })
    .sort((a, b) => a.run_type_label.localeCompare(b.run_type_label));
}

export function buildStillEfficiencyByRunType(range: ReportDateRange): StillEfficiencyRow[] {
  return buildStillEfficiencyFromRows(buildDistillationReportRows(range));
}
