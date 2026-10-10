import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { StatusBadge } from '../components/StatusBadge';
import {
  ALL_CALENDAR_KINDS,
  ALL_CALENDAR_PROGRESS,
  buildCalendarEvents,
  CALENDAR_KIND_LABELS,
  CALENDAR_PROGRESS_LABELS,
  calendarEventPath,
  eventEndDate,
  eventOccursOnDate,
  filterCalendarEvents,
  formatEventDateRange,
  layoutCalendarWeek,
  type CalendarActivityKind,
  type CalendarEvent,
  type CalendarProgress,
} from '../lib/calendar-events';
import {
  CALENDAR_PLAN_ACTIVITY_KINDS,
  CALENDAR_PLAN_PERMISSION,
  calendarPlanPath,
} from '../lib/calendar-planning';
import { groupEventsByStaff } from '../lib/today-staff-sheet';

type CalendarViewMode = 'month' | 'week' | 'today';

const VIEW_LABELS: Record<CalendarViewMode, string> = {
  month: 'Month',
  week: 'Week',
  today: 'Today',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_SPAN_LANES = 3;

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function Calendar() {
  const { hasPermission } = useAuth();
  const planRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('today');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => dateKey(new Date()));
  const [planOpen, setPlanOpen] = useState(false);
  const [enabledKinds, setEnabledKinds] = useState<Set<CalendarActivityKind>>(
    () => new Set(ALL_CALENDAR_KINDS),
  );
  const [enabledProgress, setEnabledProgress] = useState<Set<CalendarProgress>>(
    () => new Set(ALL_CALENDAR_PROGRESS),
  );

  const allEvents = useMemo(() => buildCalendarEvents(), []);
  const filteredEvents = useMemo(
    () => filterCalendarEvents(allEvents, enabledKinds, enabledProgress),
    [allEvents, enabledKinds, enabledProgress],
  );
  const monthStart = startOfMonth(anchorDate);
  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 0 });

  const calendarDays = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [monthStart]);

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }),
    [weekStart],
  );

  const selectedEvents = useMemo(
    () => filteredEvents.filter((event) => eventOccursOnDate(event, selectedDate)),
    [filteredEvents, selectedDate],
  );

  const weekRange = useMemo(() => {
    const start = dateKey(weekStart);
    const end = dateKey(addDays(weekStart, 6));
    return { start, end };
  }, [weekStart]);

  const todayKey = dateKey(new Date());
  const todayEvents = useMemo(
    () => filteredEvents.filter((event) => eventOccursOnDate(event, todayKey)),
    [filteredEvents, todayKey],
  );

  const periodLabel = useMemo(() => {
    if (viewMode === 'today') return 'Today';
    if (viewMode === 'month') return format(monthStart, 'MMMM yyyy');
    const weekEnd = addDays(weekStart, 6);
    return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
  }, [viewMode, monthStart, weekStart]);

  const periodEventCount = useMemo(() => {
    if (viewMode === 'today') return todayEvents.length;
    if (viewMode === 'month') {
      const prefix = format(monthStart, 'yyyy-MM');
      return filteredEvents.filter(
        (event) => event.startDate.startsWith(prefix) || eventEndDate(event).startsWith(prefix),
      ).length;
    }
    return filteredEvents.filter(
      (event) => event.startDate <= weekRange.end && eventEndDate(event) >= weekRange.start,
    ).length;
  }, [viewMode, monthStart, filteredEvents, weekRange, todayEvents.length]);

  const planKinds = CALENDAR_PLAN_ACTIVITY_KINDS.filter((kind) => (
    hasPermission(CALENDAR_PLAN_PERMISSION[kind])
  ));

  useEffect(() => {
    if (!planOpen) return;
    const close = (event: MouseEvent) => {
      if (!planRef.current?.contains(event.target as Node)) setPlanOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [planOpen]);

  const toggleKind = (kind: CalendarActivityKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const toggleProgress = (progress: CalendarProgress) => {
    setEnabledProgress((prev) => {
      const next = new Set(prev);
      if (next.has(progress)) next.delete(progress);
      else next.add(progress);
      return next;
    });
  };

  const selectDay = (day: Date) => {
    setSelectedDate(dateKey(day));
    setAnchorDate(day);
  };

  const goToday = () => {
    const today = new Date();
    setAnchorDate(today);
    setSelectedDate(dateKey(today));
  };

  const goPrevious = () => {
    if (viewMode === 'month') setAnchorDate((date) => subMonths(date, 1));
    else setAnchorDate((date) => subWeeks(date, 1));
  };

  const goNext = () => {
    if (viewMode === 'month') setAnchorDate((date) => addMonths(date, 1));
    else setAnchorDate((date) => addWeeks(date, 1));
  };

  return (
    <div>
      <div className="page-header">
        <h2>Production Calendar</h2>
        <p>See what is running, open the record, and plan the selected day.</p>
      </div>

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          {viewMode !== 'today' && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={goPrevious} aria-label="Previous">
                ←
              </button>
              <h3 className="calendar-month-label">{periodLabel}</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={goNext} aria-label="Next">
                →
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={goToday}>
                Today
              </button>
            </>
          )}
          {viewMode === 'today' && <h3 className="calendar-month-label">Today</h3>}
        </div>
        <div className="calendar-view-toggle">
          {(['today', 'week', 'month'] as CalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`btn btn-sm btn-secondary${viewMode === mode ? ' active' : ''}`}
              onClick={() => {
                setViewMode(mode);
                if (mode === 'today') goToday();
              }}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="calendar-month-summary text-muted">
          {periodEventCount} {periodEventCount === 1 ? 'activity' : 'activities'} in view
        </p>
      </div>

      <div className="calendar-filters">
        <span className="calendar-filter-heading">Activity</span>
        {ALL_CALENDAR_KINDS.map((kind) => (
          <label key={kind} className={`calendar-filter-chip calendar-kind-${kind}`}>
            <input type="checkbox" checked={enabledKinds.has(kind)} onChange={() => toggleKind(kind)} />
            {CALENDAR_KIND_LABELS[kind]}
          </label>
        ))}
      </div>

      <div className="calendar-filters calendar-status-filters">
        <span className="calendar-filter-heading">Status</span>
        {ALL_CALENDAR_PROGRESS.map((progress) => (
          <label key={progress} className="calendar-filter-chip">
            <input
              type="checkbox"
              checked={enabledProgress.has(progress)}
              onChange={() => toggleProgress(progress)}
            />
            {CALENDAR_PROGRESS_LABELS[progress]}
          </label>
        ))}
      </div>

      <div className="calendar-layout">
        <div className="calendar-grid-wrap card">
          {viewMode === 'month' && (
            <>
              <div className="calendar-weekdays">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="calendar-weekday">{label}</div>
                ))}
              </div>
              <div className="calendar-month">
                {chunkWeeks(calendarDays).map((week) => (
                  <CalendarSpanWeek
                    key={dateKey(week[0])}
                    days={week}
                    events={filteredEvents}
                    month={monthStart}
                    selectedDate={selectedDate}
                    onSelectDay={selectDay}
                  />
                ))}
              </div>
            </>
          )}

          {viewMode === 'week' && (
            <CalendarSpanWeek
              days={weekDays}
              events={filteredEvents}
              selectedDate={selectedDate}
              onSelectDay={selectDay}
              showWeekday
            />
          )}

          {viewMode === 'today' && (
            <TodayStaffSheet events={todayEvents} day={parseISO(todayKey)} />
          )}
        </div>

        <aside className="calendar-detail card">
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="text-muted">No activities on this date.</p>
          ) : (
            <ul className="calendar-detail-list">
              {selectedEvents.map((event) => (
                <CalendarDetailItem key={event.id} event={event} />
              ))}
            </ul>
          )}

          {planKinds.length > 0 && (
            <div className="calendar-plan-section">
              <h4 className="calendar-plan-title">Plan production</h4>
              <p className="text-muted calendar-plan-hint">
                Start a planned record dated {format(parseISO(selectedDate), 'MMM d, yyyy')}. Recipes, volumes, and assignments are on the next screen.
              </p>
              <div className="calendar-plan-menu" ref={planRef}>
                <button
                  type="button"
                  className="btn btn-primary"
                  aria-expanded={planOpen}
                  aria-haspopup="menu"
                  onClick={() => setPlanOpen((open) => !open)}
                >
                  Plan this day
                </button>
                {planOpen && (
                  <div className="calendar-plan-choices" role="menu">
                    {planKinds.map((kind) => (
                      <Link
                        key={kind}
                        to={calendarPlanPath(kind, selectedDate)}
                        className="calendar-plan-choice"
                        role="menuitem"
                        onClick={() => setPlanOpen(false)}
                      >
                        <span className={`calendar-event-dot calendar-kind-${kind}`} />
                        {CALENDAR_KIND_LABELS[kind]}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function chunkWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

function CalendarSpanWeek({
  days,
  events,
  month,
  selectedDate,
  onSelectDay,
  showWeekday = false,
}: {
  days: Date[];
  events: CalendarEvent[];
  month?: Date;
  selectedDate: string;
  onSelectDay: (day: Date) => void;
  showWeekday?: boolean;
}) {
  const keys = days.map(dateKey);
  const spans = layoutCalendarWeek(keys, events);
  const visible = spans.filter((span) => span.lane < MAX_SPAN_LANES);
  const hiddenByCol = keys.map((_, column) => spans.filter((span) => (
    span.lane >= MAX_SPAN_LANES && span.startCol <= column && column <= span.endCol
  )).length);
  const laneCount = visible.reduce((max, span) => Math.max(max, span.lane + 1), 0);
  const showMore = hiddenByCol.some((count) => count > 0);

  return (
    <div
      className={showWeekday ? 'calendar-span-week calendar-span-week--labeled' : 'calendar-span-week'}
      style={{
        gridTemplateRows: `auto repeat(${laneCount}, 1.2rem)${showMore ? ' auto' : ''}`,
      }}
    >
      {days.map((day, index) => {
        const key = keys[index];
        return (
          <div
            key={key}
            role="button"
            tabIndex={0}
            className={[
              'calendar-day',
              month && !isSameMonth(day, month) && 'calendar-day-outside',
              key === selectedDate && 'calendar-day-selected',
              isToday(day) && 'calendar-day-today',
            ].filter(Boolean).join(' ')}
            style={{ gridColumn: index + 1, gridRow: '1 / -1' }}
            onClick={() => onSelectDay(day)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectDay(day);
              }
            }}
          />
        );
      })}
      {days.map((day, index) => (
        <span
          key={`label-${keys[index]}`}
          className={[
            'calendar-day-label',
            month && !isSameMonth(day, month) && 'calendar-day-outside',
            isToday(day) && 'calendar-day-today',
          ].filter(Boolean).join(' ')}
          style={{ gridColumn: index + 1, gridRow: 1 }}
        >
          {showWeekday && <span className="calendar-weekday">{format(day, 'EEE')}</span>}
          <span className="calendar-day-number">{format(day, 'd')}</span>
        </span>
      ))}
      {visible.map((span) => (
        <Link
          key={`${span.event.id}-${keys[span.startCol]}`}
          to={calendarEventPath(span.event)}
          className={[
            'calendar-span-bar',
            `calendar-kind-${span.event.kind}`,
            span.continuesBefore && 'calendar-span-continues-before',
            span.continuesAfter && 'calendar-span-continues-after',
          ].filter(Boolean).join(' ')}
          style={{
            gridColumn: `${span.startCol + 1} / ${span.endCol + 2}`,
            gridRow: span.lane + 2,
          }}
          title={[
            CALENDAR_KIND_LABELS[span.event.kind],
            span.event.title,
            formatEventDateRange(span.event),
          ].filter(Boolean).join(' · ')}
          onClick={(eventClick) => eventClick.stopPropagation()}
        >
          <span className="calendar-span-title">{span.event.title}</span>
        </Link>
      ))}
      {hiddenByCol.map((count, index) => count > 0 ? (
        <button
          key={`more-${keys[index]}`}
          type="button"
          className="calendar-event-more"
          style={{ gridColumn: index + 1, gridRow: laneCount + 2 }}
          onClick={(event) => {
            event.stopPropagation();
            onSelectDay(days[index]);
          }}
        >
          +{count}
        </button>
      ) : null)}
    </div>
  );
}

function TodayStaffSheet({ events, day }: { events: CalendarEvent[]; day: Date }) {
  const groups = groupEventsByStaff(events);

  return (
    <div className="today-staff-sheet">
      <header className="today-staff-sheet-header">
        <div>
          <p className="today-staff-sheet-kicker">Daily work sheet</p>
          <h3 className="today-staff-sheet-title">Today</h3>
          <p className="today-staff-sheet-date">{format(day, 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm no-print"
          onClick={() => window.print()}
        >
          Print staff sheet
        </button>
      </header>
      {groups.length === 0 ? (
        <p className="text-muted">Nothing is scheduled today.</p>
      ) : (
        groups.map((group) => (
          <section key={group.name} className="today-staff-person">
            <h4>{group.name}</h4>
            <div className="today-staff-table-wrap">
              <table className="today-staff-table">
                <thead>
                  <tr>
                    <th className="today-sheet-check-col">Done</th>
                    <th>Work</th>
                    <th>What</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {group.events.map((event) => (
                    <tr key={event.id}>
                      <td className="today-sheet-check-col">
                        <span className="today-sheet-check" aria-hidden="true" />
                      </td>
                      <td>{CALENDAR_KIND_LABELS[event.kind]}</td>
                      <td>
                        <Link to={calendarEventPath(event)} className="today-sheet-link">
                          {event.title}
                        </Link>
                      </td>
                      <td><StatusBadge status={event.status} /></td>
                      <td>{event.detail || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function CalendarDetailItem({ event }: { event: CalendarEvent }) {
  return (
    <li className="calendar-detail-item">
      <div className="calendar-detail-header">
        <span className="calendar-kind-label">
          <span className={`calendar-event-dot calendar-kind-${event.kind}`} />
          {CALENDAR_KIND_LABELS[event.kind]}
        </span>
        <StatusBadge status={event.status} />
      </div>
      <Link to={calendarEventPath(event)} className="calendar-detail-title">
        {event.title}
      </Link>
      <p className="calendar-detail-meta text-muted">{formatEventDateRange(event)}</p>
      <p className="calendar-detail-meta text-muted">
        {event.assignee?.trim() ? `Assigned to ${event.assignee.trim()}` : 'Unassigned'}
      </p>
      {event.detail && <p className="calendar-detail-meta text-muted">{event.detail}</p>}
    </li>
  );
}
