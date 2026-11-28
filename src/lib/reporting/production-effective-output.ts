import { buildBlendReportRows } from './blend-rows';
import { buildBottlingReportRows } from './bottling-rows';
import { litersFromUsGal, roundAlcohol, volumeLitersAtTargetAbv } from './alcohol-units';
import { laaLitersFromPureAlcoholGal, summarizeProductionAlcoholBalance } from './production-alcohol-balance';
import type { ReportDateRange } from './period';

const STANDARD_BOTTLE_ABV = 40;

export interface DeliveredBottlingOutputSummary {
  bottledRunCount: number;
  shippedVolumeGal: number;
  shippedVolumeLiters: number;
  shippedLaaGal: number;
  shippedLaaLiters: number;
}

export interface PipelineAlcoholAdjustmentsSummary {
  /** Signed net distillation balance: positive means net loss, negative means net gain. */
  distillationNetAlcoholGal: number;
  distillationLossGal: number;
  distillationGainGal: number;
  blendAlcoholLossGal: number;
  blendAlcoholGainGal: number;
  /** Sum of bottling alcohol variance (negative is loss, positive is gain). */
  bottlingAlcoholVarianceGal: number;
  bottlingAlcoholLossGal: number;
  bottlingAlcoholGainGal: number;
  stillChargeSourceAlcoholVarianceGal: number;
  stillChargeSourceAlcoholLossGal: number;
  stillChargeSourceAlcoholGainGal: number;
}

export interface EffectiveDeliveredOutputSummary {
  delivered: DeliveredBottlingOutputSummary;
  pipeline: PipelineAlcoholAdjustmentsSummary;
  /**
   * Pure alcohol available for shipment after pipeline losses and gains.
   * Bottled LAA plus net losses on distillation, blending, and bottling (before the package).
   */
  accountableLaaGal: number;
  accountableLaaLiters: number;
  proofedLitersAt40Abv: number;
}

function roundLiters(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function summarizeDeliveredBottlingOutput(range: ReportDateRange): DeliveredBottlingOutputSummary {
  const rows = buildBottlingReportRows(range);
  let shippedVolumeGal = 0;
  let shippedLaaGal = 0;
  for (const row of rows) {
    if (!(row.bottled_gal > 0)) continue;
    shippedVolumeGal += row.bottled_gal;
    shippedLaaGal += row.bottled_laa_gal;
  }
  shippedVolumeGal = roundAlcohol(shippedVolumeGal);
  shippedLaaGal = roundAlcohol(shippedLaaGal);
  return {
    bottledRunCount: rows.length,
    shippedVolumeGal,
    shippedVolumeLiters: roundLiters(litersFromUsGal(shippedVolumeGal)),
    shippedLaaGal,
    shippedLaaLiters: roundLiters(laaLitersFromPureAlcoholGal(shippedLaaGal)),
  };
}

export function summarizePipelineAlcoholAdjustments(range: ReportDateRange): PipelineAlcoholAdjustmentsSummary {
  const balance = summarizeProductionAlcoholBalance(range);
  const distillationNetAlcoholGal = balance.distillationNetAlcoholGal;
  const distillationLossGal = distillationNetAlcoholGal > 0 ? roundAlcohol(distillationNetAlcoholGal) : 0;
  const distillationGainGal = distillationNetAlcoholGal < 0 ? roundAlcohol(-distillationNetAlcoholGal) : 0;

  let blendAlcoholLossGal = 0;
  let blendAlcoholGainGal = 0;
  for (const blend of buildBlendReportRows(range)) {
    const delta = blend.spirit_laa_gal - blend.final_laa_gal;
    if (delta > 0) blendAlcoholLossGal += delta;
    else if (delta < 0) blendAlcoholGainGal += -delta;
  }
  blendAlcoholLossGal = roundAlcohol(blendAlcoholLossGal);
  blendAlcoholGainGal = roundAlcohol(blendAlcoholGainGal);

  const bottlingAlcoholVarianceGal = balance.bottlingAlcoholVarianceGal;
  const bottlingAlcoholLossGal = bottlingAlcoholVarianceGal < 0 ? roundAlcohol(-bottlingAlcoholVarianceGal) : 0;
  const bottlingAlcoholGainGal = bottlingAlcoholVarianceGal > 0 ? roundAlcohol(bottlingAlcoholVarianceGal) : 0;

  const stillChargeSourceAlcoholVarianceGal = balance.stillChargeSourceAlcoholVarianceGal;
  const stillChargeSourceAlcoholLossGal = stillChargeSourceAlcoholVarianceGal < 0
    ? roundAlcohol(-stillChargeSourceAlcoholVarianceGal)
    : 0;
  const stillChargeSourceAlcoholGainGal = stillChargeSourceAlcoholVarianceGal > 0
    ? roundAlcohol(stillChargeSourceAlcoholVarianceGal)
    : 0;

  return {
    distillationNetAlcoholGal,
    distillationLossGal,
    distillationGainGal,
    blendAlcoholLossGal,
    blendAlcoholGainGal,
    bottlingAlcoholVarianceGal,
    bottlingAlcoholLossGal,
    bottlingAlcoholGainGal,
    stillChargeSourceAlcoholVarianceGal,
    stillChargeSourceAlcoholLossGal,
    stillChargeSourceAlcoholGainGal,
  };
}

/**
 * Pure alcohol output after pipeline loss and gain (hearts base when present).
 */
export function netAlcoholOutputAfterPipelineLosses(
  heartsGpaGal: number,
  pipeline: PipelineAlcoholAdjustmentsSummary,
  delivered: DeliveredBottlingOutputSummary,
): number {
  const fromHearts = heartsGpaGal
    - pipeline.distillationLossGal
    + pipeline.distillationGainGal
    - pipeline.blendAlcoholLossGal
    + pipeline.blendAlcoholGainGal
    - pipeline.bottlingAlcoholLossGal
    + pipeline.bottlingAlcoholGainGal
  - pipeline.stillChargeSourceAlcoholLossGal
  + pipeline.stillChargeSourceAlcoholGainGal;
  const accountable = heartsGpaGal > 0
    ? fromHearts
    : delivered.shippedLaaGal
      - pipeline.bottlingAlcoholGainGal
      + pipeline.bottlingAlcoholLossGal
      - pipeline.stillChargeSourceAlcoholGainGal
      + pipeline.stillChargeSourceAlcoholLossGal;
  return roundAlcohol(Math.max(0, accountable));
}

export function summarizeEffectiveDeliveredOutput(
  range: ReportDateRange,
  heartsGpaGal = 0,
): EffectiveDeliveredOutputSummary {
  const delivered = summarizeDeliveredBottlingOutput(range);
  const pipeline = summarizePipelineAlcoholAdjustments(range);
  const accountableLaaGal = netAlcoholOutputAfterPipelineLosses(heartsGpaGal, pipeline, delivered);
  const accountableLaaLiters = roundLiters(laaLitersFromPureAlcoholGal(accountableLaaGal));
  const proofedLitersAt40Abv = roundLiters(volumeLitersAtTargetAbv(accountableLaaLiters, STANDARD_BOTTLE_ABV));
  return {
    delivered,
    pipeline,
    accountableLaaGal,
    accountableLaaLiters,
    proofedLitersAt40Abv,
  };
}