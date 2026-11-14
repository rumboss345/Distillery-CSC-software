import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../calendar-events';
import {
  buildSevenDaySchedule,
  buildTodayProduction,
  filterJobs,
  filterScheduleDays,
  summarizeTodayJobs,
} from './schedule';

const TODAY = '2026-11-14';

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e',
    recordId: 1,
    startDate: TODAY,
    kind: 'distillation',
    title: 'Run R1',
    status: 'planned',
    statusCategory: 'planned',
    ...overrides,
  };
}

const events: CalendarEvent[] = [
  event({ id: 'late', startDate: '2026-11-12', title: 'Late run', assignee: 'Sam' }),
  event({ id: 'running', startDate: '2026-11-13', endDate: '2026-11-15', kind: 'fermentation', title: 'W-1', status: 'fermenting', statusCategory: 'in_progress' }),
  event({ id: 'planned', title: 'Bottle gold', kind: 'bottling', assignee: 'Alex' }),
  event({ id: 'done', title: 'Done blend', kind: 'blend', status: 'complete', statusCategory: 'complete' }),
  event({ id: 'later', startDate: '2026-11-18', title: 'Next week run', assignee: 'Sam' }),
  event({ id: 'beyond', startDate: '2026-11-25', title: 'Out of range' }),
];

describe('seven-day schedule', () => {
  it('lists seven days, carries late work onto today and skips anything beyond', () => {
    const days = buildSevenDaySchedule(events, TODAY);
    expect(days).toHaveLength(7);
    expect(days[0].isToday).toBe(true);
    expect(days[0].jobs.map((job) => job.id)).toEqual(['late', 'running', 'planned', 'done']);
    expect(days[0].jobs[0].state).toBe('overdue');
    expect(days[1].jobs.map((job) => job.id)).toEqual(['running']);
    expect(days[4].jobs.map((job) => job.id)).toEqual(['later']);
    expect(days.flatMap((day) => day.jobs).some((job) => job.id === 'beyond')).toBe(false);
  });

  it('shows unassigned work as Unassigned', () => {
    const [today] = buildSevenDaySchedule(events, TODAY, 1);
    expect(today.jobs.find((job) => job.id === 'running')?.operator).toBe('Unassigned');
  });
});

describe("today's production", () => {
  it('groups today by state and counts open work by activity', () => {
    const today = buildTodayProduction(events, TODAY);
    expect(today.overdue.map((job) => job.id)).toEqual(['late']);
    expect(today.inProgress.map((job) => job.id)).toEqual(['running']);
    expect(today.plannedToday.map((job) => job.id)).toEqual(['planned']);
    expect(today.doneToday.map((job) => job.id)).toEqual(['done']);
    expect(today.openByKind.reduce((sum, row) => sum + row.count, 0)).toBe(3);
  });
});

describe('operator filtering', () => {
  it('keeps only jobs the person may open', () => {
    const [today] = buildSevenDaySchedule(events, TODAY, 1);
    const jobs = filterJobs(today.jobs, (key) => key === 'bottling');
    expect(jobs.map((job) => job.id)).toEqual(['planned']);
  });

  it('keeps an operator’s own and unassigned jobs', () => {
    const days = filterScheduleDays(buildSevenDaySchedule(events, TODAY), () => true, 'sam');
    expect(days[0].jobs.map((job) => job.id)).toEqual(['late', 'running', 'done']);
    const summary = summarizeTodayJobs(days[0].jobs);
    expect(summary.plannedToday).toEqual([]);
    expect(days[4].jobs.map((job) => job.id)).toEqual(['later']);
  });
});
