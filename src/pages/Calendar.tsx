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
  groupEventsByDate,
  isMultiDayEvent,
  type CalendarActivityKind,
  type CalendarEvent,
  type CalendarProgress,
} from '../lib/calendar-events';
import {
  CALENDAR_PLAN_ACTIVITY_KINDS,
  CALENDAR_PLAN_PERMISSION,
  calendarPlanPath,
} from '../lib/calendar-planning';

type CalendarViewMode = 'month' | 'week' | 'agenda';

const VIEW_LABELS: Record<CalendarViewMode, string> = {
  month: 'Month',
  week: 'Week',
  agenda: 'Agenda',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_EVENT_LIMIT = 2;

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function Calendar() {
  const { hasPermission } = useAuth();
  const planRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
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
  const eventsByDate = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);

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

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') return format(monthStart, 'MMMM yyyy');
    const weekEnd = addDays(weekStart, 6);
    return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
  }, [viewMode, monthStart, weekStart]);

  const periodEventCount = useMemo(() => {
    if (viewMode === 'month') {
      const prefix = format(monthStart, 'yyyy-MM');
      return filteredEvents.filter(
        (event) => event.startDate.startsWith(prefix) || eventEndDate(event).startsWith(prefix),
      ).length;
    }
    return filteredEvents.filter(
      (event) => event.startDate <= weekRange.end && eventEndDate(event) >= weekRange.start,
    ).length;
  }, [viewMode, monthStart, filteredEvents, weekRange]);

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
        </div>
        <div className="calendar-view-toggle">
          {(['month', 'week', 'agenda'] as CalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`btn btn-sm btn-secondary${viewMode === mode ? ' active' : ''}`}
              onClick={() => setViewMode(mode)}
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
              <div className="calendar-grid">
                {calendarDays.map((day) => (
                  <CalendarDayCell
                    key={dateKey(day)}
                    day={day}
                    inMonth={isSameMonth(day, monthStart)}
                    selected={dateKey(day) === selectedDate}
                    events={eventsByDate.get(dateKey(day)) ?? []}
                    onSelect={() => selectDay(day)}
                  />
                ))}
              </div>
            </>
          )}

          {viewMode === 'week' && (
            <div className="calendar-week-view">
              {weekDays.map((day) => (
                <div key={dateKey(day)} className="calendar-week-column">
                  <button
                    type="button"
                    className={[
                      'calendar-week-column-header',
                      isToday(day) && 'calendar-day-today',
                      dateKey(day) === selectedDate && 'calendar-day-selected',
                    ].filter(Boolean).join(' ')}
                    onClick={() => selectDay(day)}
                  >
                    <span className="calendar-weekday">{format(day, 'EEE')}</span>
                    <span className="calendar-day-number">{format(day, 'd')}</span>
                  </button>
                  <div className="calendar-week-events">
                    {(eventsByDate.get(dateKey(day)) ?? []).map((event) => (
                      <WeekEventChip key={`${event.id}-${dateKey(day)}`} event={event} day={day} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'agenda' && (
            <WeekAgenda
              days={weekDays}
              eventsByDate={eventsByDate}
              selectedDate={selectedDate}
              onSelectDay={selectDay}
            />
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

function CalendarDayCell({
  day,
  inMonth,
  selected,
  events,
  onSelect,
}: {
  day: Date;
  inMonth: boolean;
  selected: boolean;
  events: CalendarEvent[];
  onSelect: () => void;
}) {
  const key = dateKey(day);
  const visible = events.slice(0, MONTH_EVENT_LIMIT);
  const hidden = events.length - visible.length;
  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        'calendar-day',
        !inMonth && 'calendar-day-outside',
        selected && 'calendar-day-selected',
        isToday(day) && 'calendar-day-today',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="calendar-day-number">{format(day, 'd')}</span>
      {events.length > 0 && (
        <div className="calendar-day-events">
          {visible.map((event) => (
            <Link
              key={`${event.id}-${key}`}
              to={calendarEventPath(event)}
              className={[
                'calendar-month-event',
                `calendar-kind-${event.kind}`,
                isMultiDayEvent(event) && event.startDate !== key && 'calendar-event-continued',
              ].filter(Boolean).join(' ')}
              title={[
                CALENDAR_KIND_LABELS[event.kind],
                event.title,
                event.assignee,
              ].filter(Boolean).join(' · ')}
              onClick={(eventClick) => eventClick.stopPropagation()}
            >
              {event.title}
            </Link>
          ))}
          {hidden > 0 && (
            <span className="calendar-event-more">+{hidden}</span>
          )}
        </div>
      )}
    </div>
  );
}

function WeekEventChip({ event, day }: { event: CalendarEvent; day: Date }) {
  const key = dateKey(day);
  const isStart = event.startDate === key;
  const continued = isMultiDayEvent(event) && !isStart;

  return (
    <Link
      to={calendarEventPath(event)}
      className={[
        'calendar-week-event',
        `calendar-kind-${event.kind}`,
        continued && 'calendar-event-continued',
      ].filter(Boolean).join(' ')}
      title={formatEventDateRange(event)}
    >
      <span className="calendar-week-event-title">{event.title}</span>
      {event.assignee && <span className="calendar-week-event-assignee">{event.assignee}</span>}
      {isStart && <StatusBadge status={event.status} />}
    </Link>
  );
}

function WeekAgenda({
  days,
  eventsByDate,
  selectedDate,
  onSelectDay,
}: {
  days: Date[];
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDate: string;
  onSelectDay: (day: Date) => void;
}) {
  const groups = days
    .map((day) => ({ day, events: eventsByDate.get(dateKey(day)) ?? [] }))
    .filter((group) => group.events.length > 0);

  if (groups.length === 0) {
    return <p className="text-muted">No activities this week with the current filters.</p>;
  }

  return (
    <div className="calendar-agenda">
      {groups.map(({ day, events }) => {
        const key = dateKey(day);
        return (
          <section key={key} className={key === selectedDate ? 'calendar-agenda-day calendar-day-selected' : 'calendar-agenda-day'}>
            <button type="button" className="calendar-agenda-date" onClick={() => onSelectDay(day)}>
              <span>{format(day, 'EEEE, MMM d')}</span>
              {isToday(day) && <span className="calendar-agenda-today">Today</span>}
            </button>
            <ul className="calendar-agenda-list">
              {events.map((event) => (
                <li key={`${event.id}-${key}`}>
                  <Link to={calendarEventPath(event)} className="calendar-agenda-row">
                    <span className={`calendar-event-dot calendar-kind-${event.kind}`} />
                    <span className="calendar-agenda-title">{event.title}</span>
                    <span className="calendar-agenda-assignee">{event.assignee || '—'}</span>
                    <StatusBadge status={event.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
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
      {event.assignee && <p className="calendar-detail-meta text-muted">{event.assignee}</p>}
      {event.detail && <p className="calendar-detail-meta text-muted">{event.detail}</p>}
    </li>
  );
}
