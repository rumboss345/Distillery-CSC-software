import type { BlendProduct, BottlingRunView } from '../types';
import { bottlingCountsTowardProduction } from './bottling-lines';

export type BlendBottlingLookup = Pick<
  BlendProduct,
  'id' | 'batch_number' | 'product_name' | 'output_holding_tank_equipment_id' | 'executed_at' | 'blend_date' | 'status'
>;

function blendStartDay(blend: BlendBottlingLookup): string {
  return (blend.executed_at ?? blend.blend_date ?? '').slice(0, 10);
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Blend batch appears on the bottling run (lot, product label, notes, etc.). */
export function bottlingRunReferencesBlendBatch(
  run: Pick<BottlingRunView, 'batch_number' | 'lot_number' | 'product_name' | 'notes'>,
  blend: Pick<BlendProduct, 'batch_number'>,
): boolean {
  const batch = normalizeToken(blend.batch_number);
  if (!batch) return false;
  const fields = [
    run.lot_number,
    run.product_name,
    run.notes,
    run.batch_number,
  ].map(normalizeToken);
  return fields.some((field) => field === batch || (field.length > 0 && field.includes(batch)));
}

function productNamesRelate(blendName: string, runName: string): boolean {
  const a = normalizeToken(blendName);
  const b = normalizeToken(runName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  return false;
}

function runMatchesBlend(
  run: BottlingRunView,
  blend: BlendBottlingLookup,
  blendDay: string,
): boolean {
  if (!bottlingCountsTowardProduction(run.status)) return false;
  if (run.bottling_date.slice(0, 10) < blendDay) return false;

  if (bottlingRunReferencesBlendBatch(run, blend)) return true;

  const outputTankId = blend.output_holding_tank_equipment_id;
  if (!outputTankId || run.source_holding_tank_equipment_id !== outputTankId) return false;

  const lot = blend.batch_number.trim();
  const runLot = run.lot_number?.trim() ?? '';
  if (lot && runLot && runLot === lot) return true;

  return productNamesRelate(blend.product_name, run.product_name);
}

/** Bottling runs that belong to this produced blend. */
export function matchingBottlingRunsForBlend(
  blend: BlendBottlingLookup,
  runs: BottlingRunView[],
): BottlingRunView[] {
  const blendDay = blendStartDay(blend);
  if (!blendDay) return [];

  const lot = blend.batch_number.trim();
  const matches = runs.filter((run) => runMatchesBlend(run, blend, blendDay));

  return matches.sort((a, b) => {
    const lotBoost = (run: BottlingRunView) => (
      lot && run.lot_number?.trim() === lot ? 1 : 0
    );
    const batchBoost = (run: BottlingRunView) => (
      bottlingRunReferencesBlendBatch(run, blend) ? 1 : 0
    );
    const diff = (batchBoost(b) + lotBoost(b)) - (batchBoost(a) + lotBoost(a));
    if (diff !== 0) return diff;
    const byDate = b.bottling_date.localeCompare(a.bottling_date);
    if (byDate !== 0) return byDate;
    return b.id - a.id;
  });
}

export function primaryBottlingRunIdForBlend(
  blend: BlendBottlingLookup,
  runs: BottlingRunView[],
): number | null {
  const finished = blend.status === 'executed' || blend.status === 'bottled' || blend.status === 'blended';
  if (!finished) return null;
  const matches = matchingBottlingRunsForBlend(blend, runs);
  return matches[0]?.id ?? null;
}