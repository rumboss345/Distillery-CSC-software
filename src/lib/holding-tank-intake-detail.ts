import { runTypeLabel } from './distillation-run-types';
import { formatCalendarDay } from './date-input';
import { proofFromAbv } from '../services/spirit-gauging';
import type { HoldingTankIntakeEntry, SpiritTransferType } from '../types';

export const INTAKE_KIND_LABELS: Record<HoldingTankIntakeEntry['kind'], string> = {
  cut: 'Distillation cut',
  transfer: 'Tank transfer',
  blend: 'Blend output',
  stillage: 'Stillage',
  opening: 'Opening on hand',
};

const SPIRIT_TYPE_LABELS: Record<SpiritTransferType, string> = {
  low_wines: 'Low wines',
  high_wines: 'High wines',
};

function capitalizeCut(cutType: string): string {
  if (!cutType.trim()) return 'Cut';
  return cutType.charAt(0).toUpperCase() + cutType.slice(1);
}

export function intakeAbvLabel(entry: HoldingTankIntakeEntry): string {
  if (entry.kind === 'stillage') return '—';
  return `${entry.abv.toFixed(1)}% ABV (${proofFromAbv(entry.abv).toFixed(1)}° proof)`;
}

export function intakeProofGallonsLabel(entry: HoldingTankIntakeEntry): string | null {
  if (entry.kind === 'stillage' || !(entry.abv > 0) || !(entry.volume_gal > 0)) return null;
  const pg = (entry.volume_gal * proofFromAbv(entry.abv)) / 100;
  return `${pg.toFixed(1)} proof gal`;
}

export interface IntakeDetailRow {
  label: string;
  value: string;
}

/** Rows for the intake detail modal (labels are stable; values omit empty fields). */
export function intakeDetailRows(entry: HoldingTankIntakeEntry): IntakeDetailRow[] {
  const rows: IntakeDetailRow[] = [
    { label: 'Type', value: INTAKE_KIND_LABELS[entry.kind] },
    { label: 'Summary', value: entry.summary },
  ];

  if (entry.batchNumber?.trim()) {
    rows.push({
      label: entry.kind === 'blend' ? 'Blend batch' : 'Run batch',
      value: entry.batchNumber.trim(),
    });
  }

  if (entry.runType?.trim()) {
    rows.push({ label: 'Run type', value: runTypeLabel(entry.runType) });
  }

  if (entry.cutType?.trim()) {
    rows.push({ label: 'Cut', value: capitalizeCut(entry.cutType) });
  }

  if (entry.stillName?.trim()) {
    rows.push({ label: 'Still', value: entry.stillName.trim() });
  }

  if (entry.mashBatch?.trim()) {
    rows.push({ label: 'Wash batch', value: entry.mashBatch.trim() });
  }

  if (entry.sourceTankName?.trim()) {
    rows.push({ label: 'From tank', value: entry.sourceTankName.trim() });
  }

  if (entry.spiritType) {
    rows.push({ label: 'Spirit type', value: SPIRIT_TYPE_LABELS[entry.spiritType] });
  }

  if (entry.productName?.trim() && entry.kind === 'blend') {
    rows.push({ label: 'Product', value: entry.productName.trim() });
  }

  if (entry.transferDate?.trim()) {
    rows.push({ label: 'Transfer date', value: formatCalendarDay(entry.transferDate) });
  }

  if (entry.blendDate?.trim()) {
    rows.push({ label: 'Blend date', value: formatCalendarDay(entry.blendDate) });
  }

  rows.push(
    { label: 'Recorded', value: entry.occurred_at },
    { label: 'Volume', value: `${entry.volume_gal.toFixed(1)} US gal` },
  );

  if (entry.kind !== 'stillage') {
    rows.push({ label: 'Strength', value: intakeAbvLabel(entry) });
    const pg = intakeProofGallonsLabel(entry);
    if (pg) rows.push({ label: 'Proof gallons', value: pg });
  }

  if (entry.kind === 'opening' && entry.alcoholGal != null && entry.alcoholGal > 0) {
    rows.push({ label: 'Alcohol (absolute)', value: `${entry.alcoholGal.toFixed(2)} gal` });
  }

  if (entry.recordedBy?.trim()) {
    rows.push({ label: 'Recorded by', value: entry.recordedBy.trim() });
  }

  if (entry.detail?.trim() && !rows.some((r) => r.value === entry.detail?.trim())) {
    rows.push({ label: 'Context', value: entry.detail.trim() });
  }

  if (entry.notes?.trim()) {
    rows.push({ label: 'Notes', value: entry.notes.trim() });
  }

  return rows;
}
