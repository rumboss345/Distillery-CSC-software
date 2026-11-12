import type { MeasureMode } from './blending';
import { spiritVolumeGalFromAmount } from './blending';
import { correctedAbvFromInputs } from '../components/AbvTemperatureInput';

export const BARREL_SOLERA_NOTES_TAG = '[barrel-solera]';

export type BarrelPreProofPhase = 'pulls' | 'initial' | 'solera' | 'remainder';

export interface BarrelBlendCheckpoint {
  measureMode: MeasureMode;
  volumeGal?: number;
  weightLbs?: number;
  abv: number;
  tempF?: number;
}

export interface BarrelSoleraReturn {
  barrel_id: number;
  volume_gal: number;
  abv: number;
}

export interface BarrelBlendSoleraState {
  initial: BarrelBlendCheckpoint | null;
  remainder: BarrelBlendCheckpoint | null;
  returns: BarrelSoleraReturn[];
  /** Gallons unaccounted between vat check, solera tops, and leftover for proofing. */
  angel_share_gal?: number | null;
  preProofComplete: boolean;
}

export function emptyBarrelBlendSoleraState(): BarrelBlendSoleraState {
  return {
    initial: null,
    remainder: null,
    returns: [],
    preProofComplete: false,
  };
}

export function theoreticalBlendFromSources(
  sources: readonly { volume_gal: number; abv: number }[],
): { volumeGal: number; abv: number } {
  let totalVol = 0;
  let totalLaa = 0;
  for (const source of sources) {
    if (!(source.volume_gal > 0) || !(source.abv > 0)) continue;
    totalVol += source.volume_gal;
    totalLaa += source.volume_gal * (source.abv / 100);
  }
  if (!(totalVol > 0)) return { volumeGal: 0, abv: 0 };
  return { volumeGal: totalVol, abv: (totalLaa / totalVol) * 100 };
}

export function volumeGalFromCheckpoint(checkpoint: BarrelBlendCheckpoint): number {
  if (checkpoint.measureMode === 'weight' && checkpoint.weightLbs != null && checkpoint.weightLbs > 0) {
    return spiritVolumeGalFromAmount(checkpoint.weightLbs, 'lbs', checkpoint.abv);
  }
  return checkpoint.volumeGal ?? 0;
}

export function abvFromCheckpoint(checkpoint: BarrelBlendCheckpoint): number {
  const corrected = correctedAbvFromInputs(
    String(checkpoint.abv),
    checkpoint.tempF != null ? String(checkpoint.tempF) : '',
  );
  return corrected ?? checkpoint.abv;
}

export function totalSoleraReturnGal(returns: readonly BarrelSoleraReturn[]): number {
  return returns.reduce((sum, row) => sum + (row.volume_gal > 0 ? row.volume_gal : 0), 0);
}

/** Loss between combined vat volume, solera returns, and leftover destined for proofing. */
export function barrelBlendAngelShareGal(
  state: Pick<BarrelBlendSoleraState, 'initial' | 'remainder' | 'returns'>,
): number {
  if (!state.initial || !state.remainder) return 0;
  const initialGal = volumeGalFromCheckpoint(state.initial);
  const remainderGal = volumeGalFromCheckpoint(state.remainder);
  if (!(initialGal > 0) || !(remainderGal >= 0)) return 0;
  const soleraGal = totalSoleraReturnGal(state.returns);
  const loss = initialGal - soleraGal - remainderGal;
  if (!(loss > 0.005)) return 0;
  return Math.round(loss * 100) / 100;
}

export function formatAngelShareNote(gal: number): string {
  return `Angel's share (barrel vat check): ${gal.toFixed(2)} gal — initial volume minus solera tops minus leftover for proofing.`;
}

export function mergeAngelShareIntoUserNotes(notes: string, angelGal: number): string {
  const withoutAngel = notes
    .split('\n')
    .filter((line) => !line.trim().startsWith("Angel's share (barrel vat check):"))
    .join('\n')
    .trim();
  if (!(angelGal > 0)) return withoutAngel;
  const line = formatAngelShareNote(angelGal);
  return withoutAngel ? `${withoutAngel}\n${line}` : line;
}

export function parseBarrelSoleraFromNotes(notes: string): BarrelBlendSoleraState | null {
  const trimmed = notes.trim();
  if (!trimmed) return null;
  const line = trimmed.split('\n').find((row) => row.startsWith(BARREL_SOLERA_NOTES_TAG));
  if (!line) return null;
  const json = line.slice(BARREL_SOLERA_NOTES_TAG.length).trim();
  try {
    const parsed = JSON.parse(json) as BarrelBlendSoleraState;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      initial: parsed.initial ?? null,
      remainder: parsed.remainder ?? null,
      returns: Array.isArray(parsed.returns) ? parsed.returns : [],
      angel_share_gal: parsed.angel_share_gal ?? null,
      preProofComplete: !!parsed.preProofComplete,
    };
  } catch {
    return null;
  }
}

export function stripBarrelSoleraFromNotes(notes: string): string {
  return notes
    .split('\n')
    .filter((line) => !line.startsWith(BARREL_SOLERA_NOTES_TAG))
    .join('\n')
    .trim();
}

export function mergeBarrelSoleraIntoNotes(notes: string, state: BarrelBlendSoleraState): string {
  const base = stripBarrelSoleraFromNotes(notes);
  const payload = JSON.stringify(state);
  const line = `${BARREL_SOLERA_NOTES_TAG}${payload}`;
  return base ? `${base}\n${line}` : line;
}

export function checkpointFromDraft(
  measureMode: MeasureMode,
  draft: { volume: string; weight: string; abv: string; tempF: string },
): BarrelBlendCheckpoint | null {
  const abvRaw = draft.abv.trim() === '' ? NaN : parseFloat(draft.abv);
  if (!Number.isFinite(abvRaw) || abvRaw <= 0) return null;
  const tempF = draft.tempF.trim() === '' ? undefined : parseFloat(draft.tempF);
  if (measureMode === 'weight') {
    const weightLbs = draft.weight.trim() === '' ? NaN : parseFloat(draft.weight);
    if (!Number.isFinite(weightLbs) || weightLbs <= 0) return null;
    return { measureMode, weightLbs, abv: abvRaw, tempF };
  }
  const volumeGal = draft.volume.trim() === '' ? NaN : parseFloat(draft.volume);
  if (!Number.isFinite(volumeGal) || volumeGal <= 0) return null;
  return { measureMode, volumeGal, abv: abvRaw, tempF };
}
