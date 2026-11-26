import { queryOne } from '../db/sql-session';
import { formatCalendarDay, formatRecordedAt } from './date-input';
import { proofFromAbv } from '../services/spirit-gauging';
import type { HoldingTankInOutEntry } from '../types';
import type { IntakeDetailRow } from './holding-tank-intake-detail';

export function inOutAbvLabel(entry: HoldingTankInOutEntry): string {
  if (!(entry.abv > 0)) return '—';
  return `${entry.abv.toFixed(1)}% ABV (${proofFromAbv(entry.abv).toFixed(1)}° proof)`;
}

export function inOutDetailRows(entry: HoldingTankInOutEntry): IntakeDetailRow[] {
  const rows: IntakeDetailRow[] = [
    { label: 'Direction', value: entry.direction === 'in' ? 'In' : 'Out' },
    { label: 'Movement', value: entry.movement_label },
    { label: 'Summary', value: entry.summary },
    { label: entry.direction === 'in' ? 'From' : 'To', value: entry.counterpart },
  ];
  if (entry.product_liquid?.trim()) {
    rows.push({ label: 'Liquid', value: entry.product_liquid.trim() });
  }
  if (entry.batch_ref?.trim()) {
    rows.push({ label: 'Batch', value: entry.batch_ref.trim() });
  }
  if (entry.user_label?.trim()) {
    rows.push({ label: 'Recorded by', value: entry.user_label.trim() });
  }
  if (entry.reference?.trim()) {
    rows.push({ label: 'Reference', value: entry.reference.trim() });
  }
  if (entry.notes?.trim()) {
    rows.push({ label: 'Notes', value: entry.notes.trim() });
  }
  return rows;
}

export interface InOutMovementLink {
  label: string;
  to: string;
}

function numericIdAfterPrefix(row_key: string, prefix: string): number | null {
  if (!row_key.startsWith(`${prefix}:`)) return null;
  const id = Number(row_key.slice(prefix.length + 1).split(':')[0]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function inOutMovementLinks(entry: HoldingTankInOutEntry): InOutMovementLink[] {
  const links: InOutMovementLink[] = [];
  const { row_key, direction } = entry;

  const cutId = numericIdAfterPrefix(row_key, 'cut');
  if (cutId != null) {
    const run = queryOne<{ distillation_run_id: number }>(
      'SELECT distillation_run_id FROM distillation_cuts WHERE id = ?',
      [cutId],
    );
    if (run?.distillation_run_id) {
      links.push({
        label: 'View run & cuts',
        to: `/distillation?cutsRun=${run.distillation_run_id}`,
      });
    }
    return links;
  }

  const stillageRunId = numericIdAfterPrefix(row_key, 'stillage');
  if (stillageRunId != null) {
    links.push({
      label: 'View distillation run',
      to: `/distillation?cutsRun=${stillageRunId}`,
    });
    return links;
  }

  const chargeRunId = numericIdAfterPrefix(row_key, 'charge');
  if (chargeRunId != null) {
    links.push({
      label: 'View distillation run',
      to: `/distillation?cutsRun=${chargeRunId}`,
    });
    return links;
  }

  const transferId = numericIdAfterPrefix(row_key, 'transfer');
  if (transferId != null) {
    links.push({
      label: 'View transfer',
      to: `/tank-transfer?record=${transferId}`,
    });
    const tanks = queryOne<{ source_tank_equipment_id: number; dest_tank_equipment_id: number | null }>(
      'SELECT source_tank_equipment_id, dest_tank_equipment_id FROM holding_tank_transfers WHERE id = ?',
      [transferId],
    );
    const otherId = direction === 'in' ? tanks?.source_tank_equipment_id : tanks?.dest_tank_equipment_id;
    if (otherId != null && otherId > 0) {
      links.push({
        label: direction === 'in' ? 'View source tank' : 'View destination tank',
        to: `/floor-plan?equipment=${otherId}`,
      });
    }
    return links;
  }

  const blendOutId = numericIdAfterPrefix(row_key, 'blend_out');
  if (blendOutId != null) {
    links.push({ label: 'Open blend batch', to: `/blending?record=${blendOutId}` });
    return links;
  }

  const blendBaseId = numericIdAfterPrefix(row_key, 'blend_base');
  if (blendBaseId != null) {
    links.push({ label: 'Open blend batch', to: `/blending?record=${blendBaseId}` });
    return links;
  }

  const blendDrawId = numericIdAfterPrefix(row_key, 'blend_draw');
  if (blendDrawId != null) {
    const blend = queryOne<{ blend_product_id: number }>(
      'SELECT blend_product_id FROM blend_spirit_sources WHERE id = ?',
      [blendDrawId],
    );
    if (blend?.blend_product_id) {
      links.push({ label: 'Open blend batch', to: `/blending?record=${blend.blend_product_id}` });
    }
    return links;
  }

  const bottleId = numericIdAfterPrefix(row_key, 'bottle');
  if (bottleId != null) {
    links.push({ label: 'Open bottling run', to: `/bottling?record=${bottleId}` });
    return links;
  }

  const barrelFillId = numericIdAfterPrefix(row_key, 'barrel_fill');
  if (barrelFillId != null) {
    const fill = queryOne<{ barrel_id: number }>(
      'SELECT barrel_id FROM barrel_fills WHERE id = ?',
      [barrelFillId],
    );
    if (fill?.barrel_id) {
      links.push({ label: 'View barrel', to: `/barrels?record=${fill.barrel_id}` });
    }
    return links;
  }

  return links;
}

export function inOutVolumeMeta(entry: HoldingTankInOutEntry): string {
  const sign = entry.direction === 'in' ? '+' : '−';
  const dateLabel = formatCalendarDay(entry.occurred_at);
  const abvPart = entry.abv > 0 ? ` @ ${entry.abv.toFixed(1)}%` : '';
  return `${sign}${entry.volume_gal.toFixed(1)} gal${abvPart} · ${dateLabel}`;
}

export function inOutModalSubtitle(entry: HoldingTankInOutEntry, tankName?: string): string {
  const when = formatRecordedAt(entry.occurred_at);
  if (!tankName) return when;
  return `${entry.direction === 'in' ? 'Into' : 'Out of'} ${tankName} · ${when}`;
}