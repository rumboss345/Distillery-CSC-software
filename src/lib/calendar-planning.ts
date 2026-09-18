import { CALENDAR_KIND_ROUTES, type CalendarActivityKind } from './calendar-events';
import type { PermissionKey } from './permissions';

/** Activity types users can schedule from the production calendar. */
export const CALENDAR_PLAN_ACTIVITY_KINDS: CalendarActivityKind[] = [
  'wash',
  'distillation',
  'barrel',
  'bottling',
  'blend',
  'transfer',
];

export const CALENDAR_PLAN_PERMISSION: Record<CalendarActivityKind, PermissionKey> = {
  wash: 'wash',
  distillation: 'distillation',
  barrel: 'barrels',
  bottling: 'bottling',
  blend: 'blending',
  transfer: 'distillation',
};

export function isValidCalendarPlanDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T12:00:00`);
  return Number.isFinite(parsed);
}

export function calendarPlanPath(kind: CalendarActivityKind, date: string): string {
  const params = new URLSearchParams({ plan: '1', date });
  if (kind === 'transfer') {
    params.set('transfer', '1');
  }
  const base = kind === 'transfer' ? CALENDAR_KIND_ROUTES.distillation : CALENDAR_KIND_ROUTES[kind];
  return `${base}?${params.toString()}`;
}

export interface CalendarPlanQuery {
  date: string | null;
  transfer: boolean;
}

export function readCalendarPlanQuery(searchParams: URLSearchParams): CalendarPlanQuery | null {
  if (searchParams.get('plan') !== '1') return null;
  const raw = searchParams.get('date');
  const date = raw && isValidCalendarPlanDate(raw) ? raw : null;
  return {
    date,
    transfer: searchParams.get('transfer') === '1',
  };
}

export function stripCalendarPlanQuery(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete('plan');
  next.delete('date');
  next.delete('transfer');
  return next;
}
