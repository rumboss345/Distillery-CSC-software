import { laaGalFromVolumeAbv, roundAlcohol, roundVolume } from '../reporting/alcohol-units';

/**
 * Pure-alcohol reconciliation for a period.
 * Every figure is gallons of pure alcohol (US) from recorded volume × ABV.
 * Recorded ABVs are already corrected to 60 °F when they are entered, so nothing here
 * corrects temperature again. Liquid volumes are never added together to find alcohol:
 * proofing compares the alcohol before and after, and shows the volume contraction separately.
 */

export interface ReconciliationRecord {
  label: string;
  href: string;
  /** Signed pure-alcohol gallons this record adds to the stage difference. Gain is positive. */
  differenceLaaGal: number;
}

export type ReconciliationStageKey =
  | 'distillation'
  | 'collection'
  | 'still_charges'
  | 'transfers'
  | 'proofing'
  | 'blending'
  | 'barrels'
  | 'bottling'
  | 'corrections';

export interface ReconciliationStage {
  key: ReconciliationStageKey;
  label: string;
  /** Pure alcohol entering the stage. */
  inLaaGal: number;
  /** Pure alcohol leaving the stage (or ending up in the product). */
  outLaaGal: number;
  /** out − in when the stage should keep its alcohol; positive is a gain. Null when there is nothing to compare. */
  differenceLaaGal: number | null;
  note: string;
  /** Records behind the difference, largest first. */
  records: ReconciliationRecord[];
  count: number;
}

export interface ReconciliationRun {
  id: number;
  batch_number: string;
  charged_laa_gal: number | null;
  collected_laa_gal: number | null;
}

export interface ReconciliationCut {
  id: number;
  run_id: number;
  batch_number: string;
  volume_gal: number;
  abv: number;
  /** Cut went into a tank or collection vessel. */
  into_tank: boolean;
}

export interface ReconciliationCharge {
  run_id: number;
  batch_number: string;
  volume_gal: number;
  abv: number;
}

export interface ReconciliationTransfer {
  id: number;
  volume_gal: number;
  abv: number;
  discarded: boolean;
  source_tank_id: number;
}

export interface ReconciliationDilution {
  id: number;
  tank_id: number;
  tank_name: string;
  spirit_volume_gal: number;
  spirit_abv: number;
  water_gal: number;
  finished_volume_gal: number;
  finished_abv: number;
}

export interface ReconciliationBlend {
  id: number;
  batch_number: string;
  tank_draw_laa_gal: number;
  barrel_draw_laa_gal: number;
  /** Alcohol carried in by flavourings or other additives with an ABV. */
  additive_laa_gal: number;
  output_volume_gal: number;
  output_abv: number;
}

export interface ReconciliationBarrelFill {
  id: number;
  volume_gal: number;
  abv: number;
}

export interface ReconciliationBottling {
  id: number;
  batch_number: string;
  /** Gallons drawn from a tank. Null for barrel or other sources. */
  draw_gal: number | null;
  draw_abv: number | null;
  bottled_gal: number;
  /** Measured bottled ABV (60 °F) when entered, else the planned bottling ABV. */
  bottled_abv: number;
  returned_gal: number;
}

export interface ReconciliationCorrection {
  id: number;
  tank_id: number;
  tank_name: string;
  book_volume_gal: number;
  book_abv: number | null;
  set_volume_gal: number;
  set_abv: number | null;
}

export interface ReconciliationInput {
  runs: ReconciliationRun[];
  cuts: ReconciliationCut[];
  charges: ReconciliationCharge[];
  transfers: ReconciliationTransfer[];
  dilutions: ReconciliationDilution[];
  blends: ReconciliationBlend[];
  barrelFills: ReconciliationBarrelFill[];
  bottlings: ReconciliationBottling[];
  corrections: ReconciliationCorrection[];
  /** Pure alcohol in spirit tanks now, from book volumes. Null when not known. */
  closingTankLaaGal: number | null;
  /** True when the period runs through today, so today's tank stock is its closing stock. */
  periodEndsToday: boolean;
}

export interface AlcoholReconciliation {
  stages: ReconciliationStage[];
  /** Change in pure alcohol held in tanks from every recorded movement. */
  tankNetChangeLaaGal: number;
  openingTankLaaGal: number | null;
  closingTankLaaGal: number | null;
  /** Sum of every stage difference: alcohol gained (+) or lost (−) in the records. */
  recordedDifferenceLaaGal: number;
  proofingWaterGal: number;
  /** Volume lost on mixing spirit with water (spirit + water − finished). Not an alcohol loss. */
  proofingContractionGal: number;
  hasData: boolean;
}

const RECORD_LIMIT = 5;
const NOISE_GAL = 0.005;

function sum(values: number[]): number {
  return roundAlcohol(values.reduce((total, value) => total + value, 0));
}

function topRecords(records: ReconciliationRecord[]): ReconciliationRecord[] {
  return records
    .filter((record) => Math.abs(record.differenceLaaGal) >= NOISE_GAL)
    .sort((a, b) => Math.abs(b.differenceLaaGal) - Math.abs(a.differenceLaaGal))
    .slice(0, RECORD_LIMIT)
    .map((record) => ({ ...record, differenceLaaGal: roundAlcohol(record.differenceLaaGal) }));
}

function laa(volumeGal: number | null | undefined, abv: number | null | undefined): number {
  if (volumeGal == null || abv == null) return 0;
  return laaGalFromVolumeAbv(volumeGal, abv);
}

export function buildAlcoholReconciliation(input: ReconciliationInput): AlcoholReconciliation {
  const stages: ReconciliationStage[] = [];

  const balancedRuns = input.runs.filter((run) => run.charged_laa_gal != null && run.collected_laa_gal != null);
  const distillIn = sum(balancedRuns.map((run) => run.charged_laa_gal ?? 0));
  const distillOut = sum(balancedRuns.map((run) => run.collected_laa_gal ?? 0));
  stages.push({
    key: 'distillation',
    label: 'Distillation',
    inLaaGal: distillIn,
    outLaaGal: distillOut,
    differenceLaaGal: balancedRuns.length > 0 ? roundAlcohol(distillOut - distillIn) : null,
    note: 'Alcohol charged to the still vs alcohol collected in all cuts. Runs without both figures are left out.',
    records: topRecords(balancedRuns.map((run) => ({
      label: `Run ${run.batch_number}`,
      href: `/distillation?record=${run.id}`,
      differenceLaaGal: (run.collected_laa_gal ?? 0) - (run.charged_laa_gal ?? 0),
    }))),
    count: balancedRuns.length,
  });

  const intoTanks = input.cuts.filter((cut) => cut.into_tank);
  const notStored = input.cuts.filter((cut) => !cut.into_tank);
  const collectedIntoTanks = sum(intoTanks.map((cut) => laa(cut.volume_gal, cut.abv)));
  const notStoredLaa = sum(notStored.map((cut) => laa(cut.volume_gal, cut.abv)));
  stages.push({
    key: 'collection',
    label: 'Cuts collected',
    inLaaGal: roundAlcohol(collectedIntoTanks + notStoredLaa),
    outLaaGal: collectedIntoTanks,
    differenceLaaGal: notStored.length > 0 ? roundAlcohol(-notStoredLaa) : null,
    note: 'Cuts put into tanks or collection vessels. Cuts with no tank (usually discarded heads) leave the books here.',
    records: topRecords(notStored.map((cut) => ({
      label: `Run ${cut.batch_number} cut not stored`,
      href: `/distillation?record=${cut.run_id}`,
      differenceLaaGal: -laa(cut.volume_gal, cut.abv),
    }))),
    count: input.cuts.length,
  });

  const charged = sum(input.charges.map((charge) => laa(charge.volume_gal, charge.abv)));
  stages.push({
    key: 'still_charges',
    label: 'Still charges from tanks',
    inLaaGal: charged,
    outLaaGal: charged,
    differenceLaaGal: null,
    note: 'Low wines and spirit drawn from tanks to charge a still. The still result is under Distillation.',
    records: [],
    count: input.charges.length,
  });

  const moved = input.transfers.filter((row) => !row.discarded);
  const discarded = input.transfers.filter((row) => row.discarded);
  const movedLaa = sum(moved.map((row) => laa(row.volume_gal, row.abv)));
  const discardedLaa = sum(discarded.map((row) => laa(row.volume_gal, row.abv)));
  stages.push({
    key: 'transfers',
    label: 'Tank transfers',
    inLaaGal: roundAlcohol(movedLaa + discardedLaa),
    outLaaGal: movedLaa,
    differenceLaaGal: discarded.length > 0 ? roundAlcohol(-discardedLaa) : null,
    note: 'Tank-to-tank moves keep their alcohol. Transfers with no destination were discarded.',
    records: topRecords(discarded.map((row) => ({
      label: `Transfer ${row.id} discarded`,
      href: `/tank-transfer?record=${row.id}`,
      differenceLaaGal: -laa(row.volume_gal, row.abv),
    }))),
    count: input.transfers.length,
  });

  const proofIn = sum(input.dilutions.map((row) => laa(row.spirit_volume_gal, row.spirit_abv)));
  const proofOut = sum(input.dilutions.map((row) => laa(row.finished_volume_gal, row.finished_abv)));
  const proofingWaterGal = roundVolume(input.dilutions.reduce((total, row) => total + row.water_gal, 0));
  const proofingContractionGal = roundVolume(input.dilutions.reduce(
    (total, row) => total + (row.spirit_volume_gal + row.water_gal - row.finished_volume_gal),
    0,
  ));
  stages.push({
    key: 'proofing',
    label: 'Proofing (water added)',
    inLaaGal: proofIn,
    outLaaGal: proofOut,
    differenceLaaGal: input.dilutions.length > 0 ? roundAlcohol(proofOut - proofIn) : null,
    note: `Water carries no alcohol. ${proofingWaterGal.toFixed(1)} gal water added; the finished volume is ${Math.abs(proofingContractionGal).toFixed(2)} gal ${proofingContractionGal >= 0 ? 'less' : 'more'} than spirit + water because alcohol and water contract when mixed.`,
    records: topRecords(input.dilutions.map((row) => ({
      label: `${row.tank_name} watered down`,
      href: `/floor-plan?equipment=${row.tank_id}`,
      differenceLaaGal: laa(row.finished_volume_gal, row.finished_abv) - laa(row.spirit_volume_gal, row.spirit_abv),
    }))),
    count: input.dilutions.length,
  });

  const blendIn = sum(input.blends.map((row) => row.tank_draw_laa_gal + row.barrel_draw_laa_gal + row.additive_laa_gal));
  const blendOut = sum(input.blends.map((row) => laa(row.output_volume_gal, row.output_abv)));
  stages.push({
    key: 'blending',
    label: 'Blending',
    inLaaGal: blendIn,
    outLaaGal: blendOut,
    differenceLaaGal: input.blends.length > 0 ? roundAlcohol(blendOut - blendIn) : null,
    note: 'Spirit drawn from tanks and barrels plus alcohol in flavourings, vs the finished blend at its recorded ABV.',
    records: topRecords(input.blends.map((row) => ({
      label: `Blend ${row.batch_number}`,
      href: `/blending?record=${row.id}`,
      differenceLaaGal: laa(row.output_volume_gal, row.output_abv)
        - (row.tank_draw_laa_gal + row.barrel_draw_laa_gal + row.additive_laa_gal),
    }))),
    count: input.blends.length,
  });

  const barrelLaa = sum(input.barrelFills.map((row) => laa(row.volume_gal, row.abv)));
  stages.push({
    key: 'barrels',
    label: 'Barrel fills',
    inLaaGal: barrelLaa,
    outLaaGal: barrelLaa,
    differenceLaaGal: null,
    note: 'Spirit moved from tanks into barrels for aging.',
    records: [],
    count: input.barrelFills.length,
  });

  const tankBottlings = input.bottlings.filter((row) => row.draw_gal != null && row.draw_abv != null);
  const bottleIn = sum(tankBottlings.map((row) => laa(row.draw_gal, row.draw_abv)));
  const bottleOut = sum(tankBottlings.map((row) => laa(row.bottled_gal + row.returned_gal, row.bottled_abv)));
  stages.push({
    key: 'bottling',
    label: 'Bottling',
    inLaaGal: bottleIn,
    outLaaGal: bottleOut,
    differenceLaaGal: tankBottlings.length > 0 ? roundAlcohol(bottleOut - bottleIn) : null,
    note: 'Alcohol drawn from the tank vs alcohol in the bottles and any spirit sent back to a tank. Uses the measured bottled ABV when one was entered.',
    records: topRecords(tankBottlings.map((row) => ({
      label: `Bottling ${row.batch_number}`,
      href: `/bottling?record=${row.id}`,
      differenceLaaGal: laa(row.bottled_gal + row.returned_gal, row.bottled_abv) - laa(row.draw_gal, row.draw_abv),
    }))),
    count: tankBottlings.length,
  });

  const correctionDiffs = input.corrections.map((row) => ({
    row,
    diff: laa(row.set_volume_gal, row.set_abv ?? row.book_abv) - laa(row.book_volume_gal, row.book_abv),
  }));
  stages.push({
    key: 'corrections',
    label: 'Tank volume corrections',
    inLaaGal: sum(input.corrections.map((row) => laa(row.book_volume_gal, row.book_abv))),
    outLaaGal: sum(input.corrections.map((row) => laa(row.set_volume_gal, row.set_abv ?? row.book_abv))),
    differenceLaaGal: input.corrections.length > 0 ? sum(correctionDiffs.map((item) => item.diff)) : null,
    note: 'Book volume replaced by a measured volume (dip or sight glass).',
    records: topRecords(correctionDiffs.map(({ row, diff }) => ({
      label: `${row.tank_name} volume set`,
      href: `/floor-plan?equipment=${row.tank_id}`,
      differenceLaaGal: diff,
    }))),
    count: input.corrections.length,
  });

  const blendTankDraws = sum(input.blends.map((row) => row.tank_draw_laa_gal));
  const bottlingNetDraw = roundAlcohol(bottleIn - sum(tankBottlings.map((row) => laa(row.returned_gal, row.bottled_abv))));
  const correctionsNet = sum(correctionDiffs.map((item) => item.diff));
  const proofingNet = roundAlcohol(proofOut - proofIn);
  const tankNetChangeLaaGal = roundAlcohol(
    collectedIntoTanks
    + blendOut
    + proofingNet
    + correctionsNet
    - charged
    - blendTankDraws
    - barrelLaa
    - bottlingNetDraw
    - discardedLaa,
  );

  const recordedDifferenceLaaGal = sum(
    stages.map((stage) => stage.differenceLaaGal ?? 0),
  );
  const closing = input.periodEndsToday ? input.closingTankLaaGal : null;
  const hasData = stages.some((stage) => stage.count > 0);

  return {
    stages,
    tankNetChangeLaaGal,
    closingTankLaaGal: closing != null ? roundAlcohol(closing) : null,
    openingTankLaaGal: closing != null ? roundAlcohol(closing - tankNetChangeLaaGal) : null,
    recordedDifferenceLaaGal,
    proofingWaterGal,
    proofingContractionGal,
    hasData,
  };
}
