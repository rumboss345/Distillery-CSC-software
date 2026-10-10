import {
  eachDayOfInterval,
  format,
  parseISO,
} from 'date-fns';
import { formatDateDisplay, localCalendarDayKey } from './date-input';
import { localIsoDate } from './planned-event-date';
import {
  getMashBatches,
  getDistillationRuns,
  getBarrels,
  getBottlingRuns,
  getBlendProducts,
  getHoldingTankTransfers,
  getAllFermentationLogs,
} from '../db/queries';
import { formatLinesSummary } from './bottling-lines';
import { washRecordPath } from './wash-stage';
import type {
  Barrel,
  BlendProduct,
  BottlingRunView,
  DistillationRun,
  FermentationLog,
  HoldingTankTransferView,
  MashBatch,
} from '../types';

export type CalendarActivityKind =
  | 'wash'
  | 'distillation'
  | 'barrel'
  | 'bottling'
  | 'blend'
  | 'transfer';

export type CalendarStatusCategory =
  | 'planned'
  | 'scheduled'
  | 'in_progress'
  | 'complete'
  | 'hold'
  | 'cancelled'
  | 'other';

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
  transfer: '/tank-transfer',
};

export const CALENDAR_STATUS_LABELS: Record<CalendarStatusCategory, string> = {
  planned: 'Planned',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  complete: 'Complete',
  hold: 'Hold',
  cancelled: 'Cancelled',
  other: 'Other',
};

export const ALL_CALENDAR_KINDS: CalendarActivityKind[] = [
  'wash',
  'distillation',
  'barrel',
  'bottling',
  'blend',
  'transfer',
];

export const ALL_CALENDAR_STATUS_CATEGORIES: CalendarStatusCategory[] = [
  'planned',
  'scheduled',
  'in_progress',
  'complete',
  'hold',
  'cancelled',
  'other',
];

/**
 * Schema limitations relevant to calendar date ranges (see types/index.ts):
 * - MashBatch: start_date only — no end_date, planned_end_date, or completion_date fields.
 * - Fermentation completion can be inferred from the last fermentation_logs.logged_at
 *   when status is complete/discarded and logs exist.
 * - Barrel: fill_date only — no dump_date or empty_date; empty/dumped status changes
 *   are not dated separately in the current schema.
 * - DistillationRun: run_date only — no run end timestamp on the run record.
 * - BottlingRun / BlendProduct: single blend_date / bottling_date only.
 */
export const CALENDAR_DATA_LIMITATIONS = [
  'Wash batches have no planned end date. Finished cooks span fermentation log dates when those logs exist.',
  'Washes, runs, blends, and barrels that are still in progress stay on the calendar from their start through today.',
  'Empty or dumped barrels have no separate end date. Aging barrels stay on the calendar until they leave the warehouse.',
  'Distillation, bottling, blending, and transfers are single-day events based on their recorded dates.',
] as const;

export type CalendarProgress = 'upcoming' | 'in_progress' | 'done';

export const CALENDAR_PROGRESS_LABELS: Record<CalendarProgress, string> = {
  upcoming: 'Upcoming',
  in_progress: 'In progress',
  done: 'Done',
};

export const ALL_CALENDAR_PROGRESS: CalendarProgress[] = ['upcoming', 'in_progress', 'done'];

export interface CalendarEvent {
  id: string;
  recordId?: number;
  startDate: string;
  endDate?: string;
  allDay?: boolean;
  kind: CalendarActivityKind;
  title: string;
  /** Raw status value from the production record. */
  status: string;
  statusCategory: CalendarStatusCategory;
  assignee?: string;
  detail?: string;
  /** Fermentation page, rather than the wash page, owns this wash record. */
  washOnFermentation?: boolean;
}

export interface CalendarProductionData {
  mashes: MashBatch[];
  fermentationLogs: FermentationLog[];
  runs: DistillationRun[];
  barrels: Barrel[];
  bottlings: BottlingRunView[];
  blends: BlendProduct[];
  transfers: HoldingTankTransferView[];
}

function toDateOnly(value: string | null | undefined): string | undefined {
  const day = localCalendarDayKey(value);
  return day || undefined;
}

export function calendarEventPath(event: Pick<CalendarEvent, 'kind' | 'status' | 'recordId' | 'washOnFermentation'>): string {
  const base = event.kind === 'wash'
    ? washRecordPath(event.status, {
      hasLogs: Boolean(event.washOnFermentation),
      hasAssignments: Boolean(event.washOnFermentation),
    })
    : CALENDAR_KIND_ROUTES[event.kind];
  if (event.recordId == null) return base;
  return `${base}?record=${event.recordId}`;
}

/** In-progress work stays on the calendar from its start through today. */
export function spanThroughToday(startDate: string, today: string): string | undefined {
  return startDate < today ? today : undefined;
}

export function calendarProgress(category: CalendarStatusCategory): CalendarProgress {
  if (category === 'in_progress' || category === 'hold') return 'in_progress';
  if (category === 'complete' || category === 'cancelled' || category === 'other') return 'done';
  return 'upcoming';
}

export function isMultiDayEvent(event: CalendarEvent): boolean {
  return Boolean(event.endDate && event.endDate !== event.startDate);
}

export function eventEndDate(event: CalendarEvent): string {
  return event.endDate ?? event.startDate;
}

/** Primary sort/display date — preserved for callers that used the legacy `date` field. */
export function eventPrimaryDate(event: CalendarEvent): string {
  return event.startDate;
}

export function mapWashStatus(status: MashBatch['status']): CalendarStatusCategory {
  switch (status) {
    case 'planned':
      return 'planned';
    case 'mashing':
    case 'fermenting':
      return 'in_progress';
    case 'complete':
      return 'complete';
    case 'discarded':
      return 'cancelled';
    default:
      return 'other';
  }
}

export function mapRunStatus(status: DistillationRun['status']): CalendarStatusCategory {
  switch (status) {
    case 'planned':
      return 'planned';
    case 'running':
      return 'in_progress';
    case 'complete':
      return 'complete';
    default:
      return 'other';
  }
}

export function mapBarrelStatus(status: Barrel['status']): CalendarStatusCategory {
  switch (status) {
    case 'aging':
      return 'in_progress';
    case 'empty':
      return 'complete';
    case 'dumped':
      return 'cancelled';
    default:
      return 'other';
  }
}

export function mapBlendStatus(status: BlendProduct['status']): CalendarStatusCategory {
  switch (status) {
    case 'draft':
    case 'trial':
      return 'planned';
    case 'approved':
      return 'in_progress';
    case 'executed':
    case 'blended':
    case 'bottled':
      return 'complete';
    default:
      return 'other';
  }
}

export function fermentationLogsForBatch(
  logs: FermentationLog[],
  mashBatchId: number,
): FermentationLog[] {
  return logs.filter((log) => log.mash_batch_id === mashBatchId);
}

/**
 * Derive fermentation end from log timestamps when the batch is finished.
 * Returns undefined when no reliable end marker exists (no logs, or still in progress).
 */
export function deriveFermentationEndDate(
  batch: MashBatch,
  logs: FermentationLog[],
): string | undefined {
  if (batch.status !== 'complete' && batch.status !== 'discarded') {
    return undefined;
  }
  const batchLogs = fermentationLogsForBatch(logs, batch.id);
  if (batchLogs.length === 0) {
    return undefined;
  }
  const logDates = batchLogs
    .map((log) => toDateOnly(log.logged_at))
    .filter((d): d is string => Boolean(d))
    .sort();
  return logDates[logDates.length - 1];
}

export function buildWashCalendarEvent(
  batch: MashBatch,
  logs: FermentationLog[],
  today: string = localIsoDate(),
): CalendarEvent | null {
  const startDate = toDateOnly(batch.start_date);
  if (!startDate) return null;

  const inProgress = batch.status === 'mashing' || batch.status === 'fermenting';
  const endFromLogs = deriveFermentationEndDate(batch, logs);
  const endDate = inProgress
    ? spanThroughToday(startDate, today)
    : endFromLogs && endFromLogs > startDate
      ? endFromLogs
      : undefined;
  const batchLogs = fermentationLogsForBatch(logs, batch.id);
  const washOnFermentation = washRecordPath(batch.status, {
    hasLogs: batchLogs.length > 0,
    hasAssignments: false,
  }) === '/fermentation';

  return {
    id: `wash-${batch.id}`,
    recordId: batch.id,
    startDate,
    endDate,
    allDay: true,
    kind: 'wash',
    title: batch.batch_number,
    status: batch.status,
    statusCategory: mapWashStatus(batch.status),
    assignee: batch.assigned_user_name || undefined,
    detail: batch.recipe_name || batch.grain_type || undefined,
    washOnFermentation,
  };
}

export function buildCalendarEventsFromData(
  data: CalendarProductionData,
  today: string = localIsoDate(),
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const batch of data.mashes) {
    const event = buildWashCalendarEvent(batch, data.fermentationLogs, today);
    if (event) events.push(event);
  }

  for (const run of data.runs) {
    const startDate = toDateOnly(run.run_date);
    if (!startDate) continue;
    events.push({
      id: `run-${run.id}`,
      recordId: run.id,
      startDate,
      endDate: run.status === 'running' ? spanThroughToday(startDate, today) : undefined,
      allDay: true,
      kind: 'distillation',
      title: run.batch_number,
      status: run.status,
      statusCategory: mapRunStatus(run.status),
      assignee: run.assigned_user_name || undefined,
      detail: run.still_name || undefined,
    });
  }

  for (const barrel of data.barrels) {
    const startDate = toDateOnly(barrel.fill_date);
    if (!startDate) continue;
    events.push({
      id: `barrel-fill-${barrel.id}`,
      recordId: barrel.id,
      startDate,
      endDate: barrel.status === 'aging' ? spanThroughToday(startDate, today) : undefined,
      allDay: true,
      kind: 'barrel',
      title: barrel.barrel_number,
      status: barrel.status,
      statusCategory: mapBarrelStatus(barrel.status),
      detail: `${barrel.spirit_type} — fill`,
    });
  }

  for (const bottling of data.bottlings) {
    const startDate = toDateOnly(bottling.bottling_date);
    if (!startDate) continue;
    events.push({
      id: `bottling-${bottling.id}`,
      recordId: bottling.id,
      startDate,
      allDay: true,
      kind: 'bottling',
      title: bottling.product_name || bottling.batch_number,
      status: 'complete',
      statusCategory: 'complete',
      detail: bottling.lines.length > 0
        ? formatLinesSummary(bottling.lines)
        : `${bottling.bottle_count} bottles`,
    });
  }

  for (const blend of data.blends) {
    const startDate = toDateOnly(blend.blend_date);
    if (!startDate) continue;
    events.push({
      id: `blend-${blend.id}`,
      recordId: blend.id,
      startDate,
      endDate: blend.status === 'approved' ? spanThroughToday(startDate, today) : undefined,
      allDay: true,
      kind: 'blend',
      title: blend.product_name || blend.batch_number,
      status: blend.status,
      statusCategory: mapBlendStatus(blend.status),
      assignee: blend.assigned_user_name || undefined,
      detail: blend.product_name ? blend.batch_number : undefined,
    });
  }

  for (const transfer of data.transfers) {
    const startDate = toDateOnly(transfer.transfer_date);
    if (!startDate) continue;
    events.push({
      id: `transfer-${transfer.id}`,
      recordId: transfer.id,
      startDate,
      allDay: true,
      kind: 'transfer',
      title: `${transfer.source_tank_name ?? 'Tank'} → ${transfer.dest_tank_name ?? 'Tank'}`,
      status: 'transfer',
      statusCategory: 'other',
      detail: `${transfer.volume_gal.toFixed(1)} gal @ ${transfer.abv.toFixed(1)}%`,
    });
  }

  return sortCalendarEvents(events);
}

export function buildCalendarEvents(): CalendarEvent[] {
  return buildCalendarEventsFromData({
    mashes: getMashBatches(),
    fermentationLogs: getAllFermentationLogs(),
    runs: getDistillationRuns(),
    barrels: getBarrels(),
    bottlings: getBottlingRuns(),
    blends: getBlendProducts(),
    transfers: getHoldingTankTransfers(),
  });
}

export function sortCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const byStart = a.startDate.localeCompare(b.startDate);
    if (byStart !== 0) return byStart;
    const byEnd = eventEndDate(a).localeCompare(eventEndDate(b));
    if (byEnd !== 0) return byEnd;
    return a.title.localeCompare(b.title);
  });
}

export function enumerateEventDates(event: CalendarEvent): string[] {
  const start = parseISO(event.startDate);
  const end = parseISO(eventEndDate(event));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return event.startDate ? [event.startDate] : [];
  }
  if (end < start) {
    return [event.startDate];
  }
  return eachDayOfInterval({ start, end }).map((day) => format(day, 'yyyy-MM-dd'));
}

export function eventOccursOnDate(event: CalendarEvent, date: string): boolean {
  if (!date) return false;
  const end = eventEndDate(event);
  return event.startDate <= date && date <= end;
}

export function filterEventsByKind(
  events: CalendarEvent[],
  enabledKinds: Set<CalendarActivityKind>,
): CalendarEvent[] {
  if (enabledKinds.size === 0) return [];
  return events.filter((event) => enabledKinds.has(event.kind));
}

/**
 * Status filter matching. "Scheduled" includes planned records because the schema
 * has no separate scheduled date/status field.
 */
export function matchesStatusCategoryFilter(
  event: CalendarEvent,
  enabledCategories: Set<CalendarStatusCategory>,
): boolean {
  if (enabledCategories.size === 0) return false;
  if (enabledCategories.has(event.statusCategory)) return true;
  if (enabledCategories.has('scheduled') && event.statusCategory === 'planned') {
    return true;
  }
  return false;
}

export function filterEventsByStatusCategory(
  events: CalendarEvent[],
  enabledCategories: Set<CalendarStatusCategory>,
): CalendarEvent[] {
  if (enabledCategories.size === 0) return [];
  return events.filter((event) => matchesStatusCategoryFilter(event, enabledCategories));
}

export function filterEventsByProgress(
  events: CalendarEvent[],
  enabled: Set<CalendarProgress>,
): CalendarEvent[] {
  if (enabled.size === 0) return [];
  return events.filter((event) => enabled.has(calendarProgress(event.statusCategory)));
}

export function filterCalendarEvents(
  events: CalendarEvent[],
  enabledKinds: Set<CalendarActivityKind>,
  enabledProgress: Set<CalendarProgress>,
): CalendarEvent[] {
  return filterEventsByProgress(filterEventsByKind(events, enabledKinds), enabledProgress);
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const date of enumerateEventDates(event)) {
      const list = map.get(date) ?? [];
      list.push(event);
      map.set(date, list);
    }
  }
  for (const [date, list] of map) {
    map.set(date, sortCalendarEvents(list));
  }
  return map;
}

export function eventsInRange(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string,
): CalendarEvent[] {
  return events.filter(
    (event) => event.startDate <= rangeEnd && eventEndDate(event) >= rangeStart,
  );
}

export function formatEventDateRange(event: CalendarEvent): string {
  const start = formatDateDisplay(event.startDate);
  if (!isMultiDayEvent(event) || !event.endDate) return start;
  return `${start} – ${formatDateDisplay(event.endDate)}`;
}
