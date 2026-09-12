import {
  getMashBatches,
  getDistillationRuns,
  getBarrels,
  getBottlingRuns,
  getBlendProducts,
  getHoldingTankTransfers,
} from '../db/queries';

export type CalendarActivityKind =
  | 'wash'
  | 'distillation'
  | 'barrel'
  | 'bottling'
  | 'blend'
  | 'transfer';

export const CALENDAR_KIND_LABELS: Record<CalendarActivityKind, string> = {
  wash: 'Wash & Ferment',
  distillation: 'Distillation',
  barrel: 'Barrel Aging',
  bottling: 'Bottling',
  blend: 'Blending',
  transfer: 'Tank Transfer',
};

export const CALENDAR_KIND_ROUTES: Record<CalendarActivityKind, string> = {
  wash: '/wash',
  distillation: '/distillation',
  barrel: '/barrels',
  bottling: '/bottling',
  blend: '/blending',
  transfer: '/distillation',
};

export interface CalendarEvent {
  id: string;
  date: string;
  kind: CalendarActivityKind;
  title: string;
  status: string;
  detail?: string;
}

export function buildCalendarEvents(): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const batch of getMashBatches()) {
    if (!batch.start_date) continue;
    events.push({
      id: `wash-${batch.id}`,
      date: batch.start_date.slice(0, 10),
      kind: 'wash',
      title: batch.batch_number,
      status: batch.status,
      detail: batch.recipe_name || batch.grain_type,
    });
  }

  for (const run of getDistillationRuns()) {
    if (!run.run_date) continue;
    events.push({
      id: `run-${run.id}`,
      date: run.run_date.slice(0, 10),
      kind: 'distillation',
      title: run.batch_number,
      status: run.status,
      detail: run.still_name,
    });
  }

  for (const barrel of getBarrels()) {
    if (!barrel.fill_date) continue;
    events.push({
      id: `barrel-${barrel.id}`,
      date: barrel.fill_date.slice(0, 10),
      kind: 'barrel',
      title: barrel.barrel_number,
      status: barrel.status,
      detail: barrel.spirit_type,
    });
  }

  for (const bottling of getBottlingRuns()) {
    if (!bottling.bottling_date) continue;
    events.push({
      id: `bottling-${bottling.id}`,
      date: bottling.bottling_date.slice(0, 10),
      kind: 'bottling',
      title: bottling.product_name || bottling.batch_number,
      status: 'complete',
      detail: `${bottling.bottle_count} bottles`,
    });
  }

  for (const blend of getBlendProducts()) {
    if (!blend.blend_date) continue;
    events.push({
      id: `blend-${blend.id}`,
      date: blend.blend_date.slice(0, 10),
      kind: 'blend',
      title: blend.product_name || blend.batch_number,
      status: blend.status,
      detail: blend.batch_number,
    });
  }

  for (const transfer of getHoldingTankTransfers()) {
    if (!transfer.transfer_date) continue;
    events.push({
      id: `transfer-${transfer.id}`,
      date: transfer.transfer_date.slice(0, 10),
      kind: 'transfer',
      title: `${transfer.source_tank_name ?? 'Tank'} → ${transfer.dest_tank_name ?? 'Tank'}`,
      status: transfer.spirit_type.replace('_', ' '),
      detail: `${transfer.volume_gal.toFixed(1)} gal @ ${transfer.abv.toFixed(1)}%`,
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  }
  return map;
}
