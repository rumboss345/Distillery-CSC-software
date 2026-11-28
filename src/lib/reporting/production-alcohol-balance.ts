import { laaLitersFromVolumeAbv } from './alcohol-units';
import { buildBottlingReportRows } from './bottling-rows';
import { buildDistillationReportRows } from './distillation-rows';
import type { ReportDateRange } from './period';

export interface ProductionAlcoholBalanceSummary {
  /** Signed pure-alcohol gallons — positive loss, negative gain. */
  distillationNetAlcoholGal: number;
  distillationChargedGal: number;
  distillationCollectedGal: number;
  distillationRunsWithBalance: number;
  /** Signed pure-alcohol gallons from bottling variance. */
  bottlingAlcoholVarianceGal: number;
  bottlingRunsWithVariance: number;
}

export function summarizeProductionAlcoholBalance(
  range: ReportDateRange,
): ProductionAlcoholBalanceSummary {
  let distillationNetAlcoholGal = 0;
  let distillationChargedGal = 0;
  let distillationCollectedGal = 0;
  let distillationRunsWithBalance = 0;

  for (const row of buildDistillationReportRows(range)) {
    if (row.alcohol_loss_gal != null) {
      distillationNetAlcoholGal += row.alcohol_loss_gal;
      distillationRunsWithBalance += 1;
    }
    if (row.alcohol_charged_gal != null) {
      distillationChargedGal += row.alcohol_charged_gal;
    }
    if (row.alcohol_collected_gal != null) {
      distillationCollectedGal += row.alcohol_collected_gal;
    }
  }

  let bottlingAlcoholVarianceGal = 0;
  let bottlingRunsWithVariance = 0;
  for (const row of buildBottlingReportRows(range)) {
    if (row.alcohol_variance_gal == null) continue;
    bottlingAlcoholVarianceGal += row.alcohol_variance_gal;
    bottlingRunsWithVariance += 1;
  }

  return {
    distillationNetAlcoholGal: roundAlcohol(distillationNetAlcoholGal),
    distillationChargedGal: roundAlcohol(distillationChargedGal),
    distillationCollectedGal: roundAlcohol(distillationCollectedGal),
    distillationRunsWithBalance,
    bottlingAlcoholVarianceGal: roundAlcohol(bottlingAlcoholVarianceGal),
    bottlingRunsWithVariance,
  };
}

export function laaLitersFromPureAlcoholGal(gpaGal: number): number {
  return laaLitersFromVolumeAbv(gpaGal, 100);
}

function roundAlcohol(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function formatNetAlcoholLossGain(gal: number): string {
  const abs = Math.abs(gal);
  if (!(abs >= 0.005)) return 'No net alcohol loss or gain recorded';
  if (gal > 0) return `Net distillation loss ${abs.toFixed(2)} gal LAA`;
  return `Net distillation gain ${abs.toFixed(2)} gal LAA`;
}

export function formatBottlingAlcoholVariance(gal: number): string {
  const abs = Math.abs(gal);
  if (!(abs >= 0.005)) return '';
  if (gal > 0) return `Bottling alcohol loss ${abs.toFixed(2)} gal LAA`;
  return `Bottling alcohol gain ${abs.toFixed(2)} gal LAA`;
}
