import { queryAll } from '../../db/database';
import { getBlendProducts, getBottlingRuns, getHoldingTankVolumeVariances } from '../../db/queries';
import { compareStoredDatesDesc } from '../date-input';
import { reportedBottlingVarianceGal } from '../bottling-lines';
import { formatDistillationAlcoholResult, stillageResidualAbv } from '../distillation-loss';
import { roundAlcohol } from './alcohol-units';
import { formatTankVolumeVariance, tankReadingChanged } from '../tank-volume-variance';
import { buildBlendReportRows } from './blend-rows';
import { buildDistillationReportRows } from './distillation-rows';
import { eventInReportRange, type ReportDateRange } from './period';

export const VOLUME_CHANGE_KINDS = {
  leftovers: 'Fermenter leftovers',
  setVolume: 'Set volume',
  wateredDown: 'Watered down',
  bottlingVariance: 'Bottling variance',
  bottlingToTank: 'Bottling to tank',
  blend: 'Blend volume',
  distillation: 'Distillation loss',
} as const;

const KIND_ORDER: readonly string[] = [
  VOLUME_CHANGE_KINDS.leftovers,
  VOLUME_CHANGE_KINDS.setVolume,
  VOLUME_CHANGE_KINDS.wateredDown,
  VOLUME_CHANGE_KINDS.bottlingVariance,
  VOLUME_CHANGE_KINDS.bottlingToTank,
  VOLUME_CHANGE_KINDS.blend,
  VOLUME_CHANGE_KINDS.distillation,
];

/** Kinds whose signed gallons add into the summary Volume variances box. */
const VARIANCE_TOTAL_KINDS = new Set<string>([
  VOLUME_CHANGE_KINDS.setVolume,
  VOLUME_CHANGE_KINDS.bottlingVariance,
  VOLUME_CHANGE_KINDS.blend,
  VOLUME_CHANGE_KINDS.distillation,
]);

export interface VolumeChangeRow {
  key: string;
  occurred_at: string;
  kind: string;
  place: string;
  change: string;
  why: string;
  who: string;
  /**
   * Gallons for this row. Set volume, bottling variance, and blend volume are
   * signed (positive means more than the record). Distillation loss is signed
   * the same way: a shortfall is negative. Leftovers and bottling-to-tank
   * amounts are positive gallons moved, and they stay out of the summary total.
   */
  gallons: number | null;
  /** Signed ABV percentage points. Set volume, blend differences, and stillage left after a distillation count on the summary. */
  abvPoints: number | null;
}

export interface VolumeChangeGroup {
  kind: string;
  rows: VolumeChangeRow[];
  totalLabel: string;
}

function shown(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || '—';
}

/**
 * Water blended into spirit that stays in the tank.
 * The alcohol gallons do not change, so this is not an alcohol loss.
 */
export function describeWateredDownChange(input: {
  spirit_volume_gal: number;
  spirit_abv: number;
  water_gal: number;
  finished_volume_gal: number;
  finished_abv: number;
}): { change: string; why: string; gallons: number } {
  const alcoholGal = roundAlcohol(input.spirit_volume_gal * input.spirit_abv / 100);
  const added = input.finished_volume_gal - input.spirit_volume_gal;
  return {
    change: `Blended ${input.water_gal.toFixed(2)} gal water into ${input.spirit_volume_gal.toFixed(2)} gal at ${input.spirit_abv.toFixed(1)}% ABV. Alcohol stays ${alcoholGal.toFixed(2)} gal. Tank finishes at ${input.finished_volume_gal.toFixed(2)} gal at ${input.finished_abv.toFixed(1)}% ABV.`,
    why: 'Water blended into the spirit already in the tank. Alcohol is not lost.',
    gallons: Math.round(added * 1000) / 1000,
  };
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
      kind: VOLUME_CHANGE_KINDS.leftovers,
      place: row.fermenter_name || 'Fermenter',
      change: `${row.volume_gal.toFixed(1)} gal from ${row.batch_number || 'wash'}`,
      why: shown(row.notes),
      who: shown(row.changed_by),
      gallons: row.volume_gal,
      abvPoints: null,
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
      kind: VOLUME_CHANGE_KINDS.setVolume,
      place: variance.tank_name,
      change: `${variance.book_volume_gal.toFixed(2)} gal to ${variance.set_volume_gal.toFixed(2)} gal (${formatTankVolumeVariance(variance.variance_gal)})${abvNote}`,
      why: shown(variance.notes),
      who: shown(variance.changed_by),
      gallons: variance.variance_gal,
      abvPoints: abvMoved ? variance.set_abv - variance.book_abv : null,
    });
  }

  const tankNames = new Map(
    queryAll<{ id: number; name: string }>('SELECT id, name FROM floor_equipment').map((tank) => [tank.id, tank.name]),
  );
  for (const run of getBottlingRuns()) {
    if (!eventInReportRange(run.bottling_date, range)) continue;
    const variance = reportedBottlingVarianceGal(run);
    if (variance != null && Math.abs(variance) >= 0.01) {
      rows.push({
        key: `bottling:${run.id}`,
        occurred_at: run.bottling_date,
        kind: VOLUME_CHANGE_KINDS.bottlingVariance,
        place: run.batch_number,
        change: `${variance > 0 ? '+' : ''}${variance.toFixed(2)} gal vs the tank (${run.product_name})`,
        why: shown(run.variance_reason),
        who: shown(run.variance_changed_by),
        gallons: variance,
        abvPoints: null,
      });
    }
    const returnedLines = (run.returns && run.returns.length > 0)
      ? run.returns
      : (run.return_holding_tank_equipment_id && (run.return_volume_gal ?? 0) >= 0.01
        ? [{
          holding_tank_equipment_id: run.return_holding_tank_equipment_id,
          volume_gal: run.return_volume_gal ?? 0,
          sort_order: 0,
        }]
        : []);
    returnedLines.forEach((line, index) => {
      if (line.volume_gal < 0.01 || !line.holding_tank_equipment_id) return;
      const tankName = tankNames.get(line.holding_tank_equipment_id) ?? 'tank';
      rows.push({
        key: `bottling-return:${run.id}:${line.holding_tank_equipment_id}:${line.sort_order ?? index}`,
        occurred_at: run.bottling_date,
        kind: VOLUME_CHANGE_KINDS.bottlingToTank,
        place: `${run.batch_number} · ${tankName}`,
        change: `${line.volume_gal.toFixed(2)} gal at ${run.final_abv.toFixed(1)}% ABV (${run.product_name})`,
        why: 'Product that was not bottled was sent to this tank.',
        who: shown(run.variance_changed_by),
        gallons: line.volume_gal,
        abvPoints: null,
      });
    });
  }

  const blendNotes = new Map(getBlendProducts().map((product) => [product.id, product.notes]));
  for (const blend of buildBlendReportRows(range)) {
    const abvDelta = blend.theoretical_abv != null ? blend.final_abv - blend.theoretical_abv : null;
    const volumeMoved = blend.volume_variance_pct != null && Math.abs(blend.volume_variance_pct) >= 0.1;
    const gallonDelta = blend.theoretical_volume_gal != null
      ? Math.round((blend.final_volume_gal - blend.theoretical_volume_gal) * 1000) / 1000
      : null;
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
      kind: VOLUME_CHANGE_KINDS.blend,
      place: blend.output_tank === '—' ? blend.batch_number : `${blend.batch_number} · ${blend.output_tank}`,
      change: parts.join('; '),
      why: shown(blendNotes.get(blend.blend_id)),
      who: shown(blend.operator === '—' ? '' : blend.operator),
      gallons: volumeMoved ? gallonDelta : null,
      abvPoints: abvMoved && abvDelta != null ? abvDelta : null,
    });
  }

  for (const run of buildDistillationReportRows(range)) {
    if (run.alcohol_loss_gal == null || Math.abs(run.alcohol_loss_gal) < 0.01) continue;
    const why = run.alcohol_charge_basis === 'estimated_brix'
      ? 'Collected alcohol compared with the wash alcohol estimated from Brix'
      : run.alcohol_charge_basis === 'proofed_spirit'
        ? 'Collected alcohol compared with the spirit charged'
        : 'Collected alcohol compared with the alcohol charged';
    const stillageAbv = stillageResidualAbv(run.alcohol_loss_gal, run.stillage_volume_gal);
    const stillageNote = stillageAbv != null && run.stillage_volume_gal != null
      ? `, stillage ${run.stillage_volume_gal.toFixed(1)} gal at ${stillageAbv.toFixed(1)}% ABV`
      : '';
    rows.push({
      key: `distillation:${run.run_id}`,
      occurred_at: run.run_date,
      kind: VOLUME_CHANGE_KINDS.distillation,
      place: run.batch_number,
      change: `${formatDistillationAlcoholResult(run.alcohol_loss_gal)} alcohol (${(run.alcohol_charged_gal ?? 0).toFixed(2)} gal charged, ${(run.alcohol_collected_gal ?? 0).toFixed(2)} gal collected)${stillageNote}`,
      why,
      who: shown(run.operator === '—' ? '' : run.operator),
      gallons: -run.alcohol_loss_gal,
      abvPoints: stillageAbv == null ? null : -stillageAbv,
    });
  }

  const dilutions = queryAll<{
    id: number;
    tank_name: string;
    spirit_volume_gal: number;
    spirit_abv: number;
    water_gal: number;
    finished_volume_gal: number;
    finished_abv: number;
    recorded_at: string;
    notes: string;
    changed_by: string | null;
  }>(`
    SELECT d.id, e.name as tank_name, d.spirit_volume_gal, d.spirit_abv, d.water_gal,
           d.finished_volume_gal, d.finished_abv, d.recorded_at, d.notes, d.changed_by
    FROM holding_tank_dilutions d
    JOIN floor_equipment e ON e.id = d.tank_equipment_id
  `);
  for (const row of dilutions) {
    if (!eventInReportRange(row.recorded_at, range)) continue;
    const described = describeWateredDownChange(row);
    rows.push({
      key: `dilution:${row.id}`,
      occurred_at: row.recorded_at,
      kind: VOLUME_CHANGE_KINDS.wateredDown,
      place: row.tank_name,
      change: described.change,
      why: shown(row.notes) === '—' ? described.why : shown(row.notes),
      who: shown(row.changed_by),
      gallons: described.gallons,
      abvPoints: null,
    });
  }

  rows.sort((a, b) => compareStoredDatesDesc(a.occurred_at, b.occurred_at));
  return rows;
}

function sumGallons(rows: VolumeChangeRow[]): number | null {
  let seen = false;
  let total = 0;
  for (const row of rows) {
    if (row.gallons == null) continue;
    seen = true;
    total += row.gallons;
  }
  if (!seen) return null;
  return Math.round(total * 1000) / 1000;
}

function formatKindTotal(kind: string, gallons: number): string {
  if (kind === VOLUME_CHANGE_KINDS.leftovers) {
    return `${gallons.toFixed(2)} gal`;
  }
  if (kind === VOLUME_CHANGE_KINDS.bottlingToTank) {
    return `${gallons.toFixed(2)} gal sent`;
  }
  if (kind === VOLUME_CHANGE_KINDS.wateredDown) {
    return `${gallons.toFixed(2)} gal added`;
  }
  return formatTankVolumeVariance(gallons);
}

function sumAbvPoints(rows: VolumeChangeRow[]): number | null {
  let seen = false;
  let total = 0;
  for (const row of rows) {
    if (row.abvPoints == null) continue;
    seen = true;
    total += row.abvPoints;
  }
  if (!seen) return null;
  return Math.round(total * 1000) / 1000;
}

/** Net gallons for the summary box: set volume, bottling variance, blend volume, and distillation loss. */
export function totalVolumeVarianceGal(rows: VolumeChangeRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.gallons == null || !VARIANCE_TOTAL_KINDS.has(row.kind)) continue;
    total += row.gallons;
  }
  return Math.round(total * 1000) / 1000;
}

/** Net ABV percentage points from set volume, blend rows, and stillage left after distillation. Bottling to a tank is not included. */
export function totalVolumeVarianceAbv(rows: VolumeChangeRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.abvPoints == null || !VARIANCE_TOTAL_KINDS.has(row.kind)) continue;
    total += row.abvPoints;
  }
  return Math.round(total * 1000) / 1000;
}

export function formatVolumeVarianceAbv(points: number): string {
  const rounded = Number(points.toFixed(1));
  if (rounded === 0) return '0.0% ABV';
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}% ABV`;
}

export function groupVolumeChanges(rows: VolumeChangeRow[]): VolumeChangeGroup[] {
  const byKind = new Map<string, VolumeChangeRow[]>();
  for (const row of rows) {
    const list = byKind.get(row.kind) ?? [];
    list.push(row);
    byKind.set(row.kind, list);
  }

  const known = KIND_ORDER.filter((kind) => byKind.has(kind));
  const extra = [...byKind.keys()].filter((kind) => !KIND_ORDER.includes(kind)).sort();

  return [...known, ...extra].map((kind) => {
    const groupRows = [...(byKind.get(kind) ?? [])].sort(
      (a, b) => compareStoredDatesDesc(a.occurred_at, b.occurred_at),
    );
    const gallons = sumGallons(groupRows);
    const abv = sumAbvPoints(groupRows);
    const parts: string[] = [];
    if (gallons != null) parts.push(formatKindTotal(kind, gallons));
    if (abv != null) parts.push(formatVolumeVarianceAbv(abv));
    const totalLabel = parts.length > 0
      ? parts.join(', ')
      : `${groupRows.length} change${groupRows.length === 1 ? '' : 's'}`;
    return { kind, rows: groupRows, totalLabel };
  });
}
