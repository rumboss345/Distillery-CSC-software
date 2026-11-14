import { addDays, format, parseISO } from 'date-fns';
import {
  CALENDAR_KIND_LABELS,
  calendarEventPath,
  calendarProgress,
  eventEndDate,
  eventOccursOnDate,
  type CalendarActivityKind,
  type CalendarEvent,
} from '../calendar-events';
import type { PermissionKey } from '../permissions';

export const KIND_PERMISSIONS: Record<CalendarActivityKind, PermissionKey> = {
  wash: 'wash',
  fermentation: 'wash',
  distillation: 'distillation',
  barrel: 'barrels',
  bottling: 'bottling',
  blend: 'blending',
  transfer: 'distillation',
  cleaning: 'equipment',
};

export type ScheduleJobState = 'in_progress' | 'planned' | 'overdue' | 'done';

export interface ScheduleJob {
  id: string;
  kind: CalendarActivityKind;
  kindLabel: string;
  title: string;
  detail: string;
  startDate: string;
  /** Last day the job is expected to occupy (expected end, or the planned day). */
  deadline: string;
  operator: string;
  state: ScheduleJobState;
  stateLabel: string;
  href: string;
  permission: PermissionKey;
}

export interface ScheduleDay {
  date: string;
  label: string;
  isToday: boolean;
  jobs: ScheduleJob[];
}

const STATE_LABELS: Record<ScheduleJobState, string> = {
  in_progress: 'In progress',
  planned: 'Planned',
  overdue: 'Overdue',
  done: 'Done',
};

/** A planned job whose day has passed without being started. Open cleaning counts once it is a day old. */
export function eventIsOverdue(event: CalendarEvent, today: string): boolean {
  if (calendarProgress(event.statusCategory) !== 'upcoming') return false;
  if (event.continuesUntilCleaned) return event.startDate < today;
  return eventEndDate(event) < today;
}

export function toScheduleJob(event: CalendarEvent, today: string): ScheduleJob {
  const progress = calendarProgress(event.statusCategory);
  const state: ScheduleJobState = eventIsOverdue(event, today)
    ? 'overdue'
    : progress === 'in_progress'
      ? 'in_progress'
      : progress === 'done'
        ? 'done'
        : 'planned';
  return {
    id: event.id,
    kind: event.kind,
    kindLabel: CALENDAR_KIND_LABELS[event.kind],
    title: event.title,
    detail: event.detail ?? '',
    startDate: event.startDate,
    deadline: event.continuesUntilCleaned ? today : eventEndDate(event),
    operator: event.assignee?.trim() || 'Unassigned',
    state,
    stateLabel: STATE_LABELS[state],
    href: calendarEventPath(event),
    permission: KIND_PERMISSIONS[event.kind],
  };
}

const STATE_RANK: Record<ScheduleJobState, number> = { overdue: 0, in_progress: 1, planned: 2, done: 3 };

function sortJobs(jobs: ScheduleJob[]): ScheduleJob[] {
  return [...jobs].sort((a, b) => (
    STATE_RANK[a.state] - STATE_RANK[b.state]
    || a.deadline.localeCompare(b.deadline)
    || a.kindLabel.localeCompare(b.kindLabel)
    || a.title.localeCompare(b.title)
  ));
}

function dayKeys(today: string, days: number): string[] {
  const start = parseISO(today);
  return Array.from({ length: days }, (_, index) => format(addDays(start, index), 'yyyy-MM-dd'));
}

/**
 * Only equipment that is dirty now. Finished cleaning and past dirty spans are calendar history,
 * not work to do.
 */
export function isOpenCleaning(event: CalendarEvent): boolean {
  return event.kind === 'cleaning' && Boolean(event.continuesUntilCleaned);
}

/**
 * The next seven days, today first.
 * Today also carries planned work whose day has passed, so nothing late drops off the list.
 * Finished work only shows on the day it happened.
 * Cleaning shows only equipment that still needs cleaning, once, on today.
 */
export function buildSevenDaySchedule(events: CalendarEvent[], today: string, days = 7): ScheduleDay[] {
  return dayKeys(today, days).map((date, index) => {
    const jobs: ScheduleJob[] = [];
    for (const event of events) {
      if (event.kind === 'cleaning' && (index > 0 || !isOpenCleaning(event))) continue;
      const job = toScheduleJob(event, today);
      if (index === 0 && job.state === 'overdue') {
        jobs.push(job);
        continue;
      }
      if (!eventOccursOnDate(event, date)) continue;
      if (job.state === 'overdue') continue;
      if (job.state === 'done' && eventEndDate(event) !== date) continue;
      jobs.push(job);
    }
    const day = parseISO(date);
    return {
      date,
      label: index === 0 ? `Today · ${format(day, 'EEE d MMM')}` : format(day, 'EEE d MMM'),
      isToday: index === 0,
      jobs: sortJobs(jobs),
    };
  });
}

export interface TodayProduction {
  inProgress: ScheduleJob[];
  plannedToday: ScheduleJob[];
  overdue: ScheduleJob[];
  doneToday: ScheduleJob[];
  /** Equipment that still needs cleaning. Kept apart so it does not bury production work. */
  needsCleaning: ScheduleJob[];
  /** Counts of today's open work by activity, for the summary chips. */
  openByKind: { kind: CalendarActivityKind; label: string; count: number }[];
}

export function buildTodayProduction(events: CalendarEvent[], today: string): TodayProduction {
  const [day] = buildSevenDaySchedule(events, today, 1);
  return summarizeTodayJobs(day?.jobs ?? []);
}

/** Groups the jobs on today's schedule row. */
export function summarizeTodayJobs(allJobs: ScheduleJob[]): TodayProduction {
  const needsCleaning = allJobs.filter((job) => job.kind === 'cleaning');
  const jobs = allJobs.filter((job) => job.kind !== 'cleaning');
  const inProgress = jobs.filter((job) => job.state === 'in_progress');
  const plannedToday = jobs.filter((job) => job.state === 'planned');
  const overdue = jobs.filter((job) => job.state === 'overdue');
  const doneToday = jobs.filter((job) => job.state === 'done');
  const counts = new Map<CalendarActivityKind, number>();
  for (const job of [...inProgress, ...plannedToday, ...overdue]) {
    counts.set(job.kind, (counts.get(job.kind) ?? 0) + 1);
  }
  const openByKind = [...counts.entries()]
    .map(([kind, count]) => ({ kind, label: CALENDAR_KIND_LABELS[kind], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (needsCleaning.length > 0) {
    openByKind.push({ kind: 'cleaning', label: 'To clean', count: needsCleaning.length });
  }
  return { inProgress, plannedToday, overdue, doneToday, needsCleaning, openByKind };
}

/** Jobs the person can open, optionally only their own. */
export function filterJobs(
  jobs: ScheduleJob[],
  hasPermission: (key: PermissionKey) => boolean,
  onlyOperator?: string | null,
): ScheduleJob[] {
  const name = onlyOperator?.trim().toLowerCase();
  return jobs.filter((job) => {
    if (!hasPermission(job.permission)) return false;
    if (!name) return true;
    return job.operator.trim().toLowerCase() === name || job.operator === 'Unassigned';
  });
}

export function filterScheduleDays(
  days: ScheduleDay[],
  hasPermission: (key: PermissionKey) => boolean,
  onlyOperator?: string | null,
): ScheduleDay[] {
  return days.map((day) => ({ ...day, jobs: filterJobs(day.jobs, hasPermission, onlyOperator) }));
}
