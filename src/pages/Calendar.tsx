import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  ALL_CALENDAR_STATUS_CATEGORIES,
  buildCalendarEvents,
  CALENDAR_DATA_LIMITATIONS,
  CALENDAR_KIND_LABELS,
  CALENDAR_KIND_ROUTES,
  CALENDAR_STATUS_LABELS,
  eventEndDate,
  eventOccursOnDate,
  filterCalendarEvents,
  formatEventDateRange,
  groupEventsByDate,
  isMultiDayEvent,
  type CalendarActivityKind,
  type CalendarEvent,
  type CalendarStatusCategory,
} from '../lib/calendar-events';

type CalendarViewMode = 'month' | 'week' | 'day';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function Calendar() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => dateKey(new Date()));
  const [enabledKinds, setEnabledKinds] = useState<Set<CalendarActivityKind>>(
    () => new Set(ALL_CALENDAR_KINDS),
  );
  const [enabledStatusCategories, setEnabledStatusCategories] = useState<
    Set<CalendarStatusCategory>
  >(() => new Set(ALL_CALENDAR_STATUS_CATEGORIES));

  const allEvents = useMemo(() => buildCalendarEvents(), []);
  const filteredEvents = useMemo(
    () => filterCalendarEvents(allEvents, enabledKinds, enabledStatusCategories),
    [allEvents, enabledKinds, enabledStatusCategories],
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

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') return format(monthStart, 'MMMM yyyy');
    if (viewMode === 'week') {
      const weekEnd = addDays(weekStart, 6);
      return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
    }
    return format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy');
  }, [viewMode, monthStart, weekStart, selectedDate]);

  const periodEventCount = useMemo(() => {
    if (viewMode === 'month') {
      const prefix = format(monthStart, 'yyyy-MM');
      return filteredEvents.filter(
        (e) => e.startDate.startsWith(prefix) || eventEndDate(e).startsWith(prefix),
      ).length;
    }
    if (viewMode === 'week') {
      const start = dateKey(weekStart);
      const end = dateKey(addDays(weekStart, 6));
      return filteredEvents.filter(
        (e) => e.startDate <= end && eventEndDate(e) >= start,
      ).length;
    }
    return selectedEvents.length;
  }, [viewMode, monthStart, weekStart, filteredEvents, selectedEvents.length]);

  const toggleKind = (kind: CalendarActivityKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const toggleStatusCategory = (category: CalendarStatusCategory) => {
    setEnabledStatusCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
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
    if (viewMode === 'month') setAnchorDate((d) => subMonths(d, 1));
    else if (viewMode === 'week') setAnchorDate((d) => subWeeks(d, 1));
    else setAnchorDate((d) => addDays(d, -1));
  };

  const goNext = () => {
    if (viewMode === 'month') setAnchorDate((d) => addMonths(d, 1));
    else if (viewMode === 'week') setAnchorDate((d) => addWeeks(d, 1));
    else setAnchorDate((d) => addDays(d, 1));
  };

  return (
    <div>
      <div className="page-header">
        <h2>Production Calendar</h2>
        <p>View wash, distillation, barrel, bottling, and blend activity by date and status</p>
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
          {(['month', 'week', 'day'] as CalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`btn btn-sm btn-secondary${viewMode === mode ? ' active' : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
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
        {ALL_CALENDAR_STATUS_CATEGORIES.map((category) => (
          <label key={category} className={`calendar-filter-chip calendar-status-${category}`}>
            <input
              type="checkbox"
              checked={enabledStatusCategories.has(category)}
              onChange={() => toggleStatusCategory(category)}
            />
            {CALENDAR_STATUS_LABELS[category]}
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

          {viewMode === 'day' && (
            <div className="calendar-day-view">
              <DayViewList
                date={selectedDate}
                events={selectedEvents}
                onSelectDate={(next) => {
                  setSelectedDate(next);
                  setAnchorDate(parseISO(next));
                }}
              />
            </div>
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
        </aside>
      </div>

      <div className="calendar-legend card">
        <h3 className="section-title" style={{ marginTop: 0 }}>Activity types</h3>
        <div className="calendar-legend-items">
          {ALL_CALENDAR_KINDS.map((kind) => (
            <span key={kind} className="calendar-legend-item">
              <span className={`calendar-event-dot calendar-kind-${kind}`} />
              {CALENDAR_KIND_LABELS[kind]}
            </span>
          ))}
        </div>
      </div>

      <div className="card calendar-limitations">
        <h3 className="section-title" style={{ marginTop: 0 }}>Date range notes</h3>
        <ul className="calendar-limitations-list">
          {CALENDAR_DATA_LIMITATIONS.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
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
  return (
    <button
      type="button"
      className={[
        'calendar-day',
        !inMonth && 'calendar-day-outside',
        selected && 'calendar-day-selected',
        isToday(day) && 'calendar-day-today',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      <span className="calendar-day-number">{format(day, 'd')}</span>
      {events.length > 0 && (
        <div className="calendar-day-events">
          {events.slice(0, 3).map((event) => (
            <span
              key={`${event.id}-${key}`}
              className={[
                'calendar-event-pill',
                `calendar-kind-${event.kind}`,
                isMultiDayEvent(event) && event.startDate !== key && 'calendar-event-continued',
              ].filter(Boolean).join(' ')}
              title={`${CALENDAR_KIND_LABELS[event.kind]}: ${event.title}`}
            />
          ))}
          {events.length > 3 && (
            <span className="calendar-event-more">+{events.length - 3}</span>
          )}
        </div>
      )}
    </button>
  );
}

function WeekEventChip({ event, day }: { event: CalendarEvent; day: Date }) {
  const key = dateKey(day);
  const isStart = event.startDate === key;
  const isEnd = eventEndDate(event) === key;
  const continued = isMultiDayEvent(event) && !isStart;

  return (
    <Link
      to={CALENDAR_KIND_ROUTES[event.kind]}
      className={[
        'calendar-week-event',
        `calendar-kind-${event.kind}`,
        continued && 'calendar-event-continued',
        isStart && 'calendar-event-start',
        isEnd && 'calendar-event-end',
      ].filter(Boolean).join(' ')}
      title={formatEventDateRange(event)}
    >
      <span className="calendar-week-event-title">{event.title}</span>
      {isStart && <StatusBadge status={event.status} />}
    </Link>
  );
}

function DayViewList({
  date,
  events,
  onSelectDate,
}: {
  date: string;
  events: CalendarEvent[];
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="calendar-day-view-inner">
      <label className="calendar-day-picker">
        <span>Select date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => onSelectDate(e.target.value)}
        />
      </label>
      {events.length === 0 ? (
        <p className="text-muted">No activities on this date with the current filters.</p>
      ) : (
        <ul className="calendar-detail-list">
          {events.map((event) => (
            <CalendarDetailItem key={event.id} event={event} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CalendarDetailItem({ event }: { event: CalendarEvent }) {
  return (
    <li className="calendar-detail-item">
      <div className="calendar-detail-header">
        <span className={`calendar-kind-label calendar-kind-${event.kind}`}>
          {CALENDAR_KIND_LABELS[event.kind]}
        </span>
        <StatusBadge status={event.status} />
      </div>
      <Link to={CALENDAR_KIND_ROUTES[event.kind]} className="calendar-detail-title">
        {event.title}
      </Link>
      <p className="calendar-detail-meta text-muted">
        {formatEventDateRange(event)}
        {isMultiDayEvent(event) ? ' · multi-day' : ''}
      </p>
      {event.detail && <p className="calendar-detail-meta text-muted">{event.detail}</p>}
    </li>
  );
}
