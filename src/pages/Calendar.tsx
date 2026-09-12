import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addMonths,
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
} from 'date-fns';
import { StatusBadge } from '../components/StatusBadge';
import {
  buildCalendarEvents,
  CALENDAR_KIND_LABELS,
  CALENDAR_KIND_ROUTES,
  groupEventsByDate,
  type CalendarActivityKind,
  type CalendarEvent,
} from '../lib/calendar-events';

const ALL_KINDS: CalendarActivityKind[] = [
  'wash',
  'distillation',
  'barrel',
  'bottling',
  'blend',
  'transfer',
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function Calendar() {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => dateKey(new Date()));
  const [enabledKinds, setEnabledKinds] = useState<Set<CalendarActivityKind>>(
    () => new Set(ALL_KINDS),
  );

  const allEvents = useMemo(() => buildCalendarEvents(), []);
  const filteredEvents = useMemo(
    () => allEvents.filter((e) => enabledKinds.has(e.kind)),
    [allEvents, enabledKinds],
  );
  const eventsByDate = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];

  const monthEventCount = filteredEvents.filter((e) =>
    e.date.startsWith(format(viewMonth, 'yyyy-MM')),
  ).length;

  const toggleKind = (kind: CalendarActivityKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const selectDay = (day: Date) => {
    setSelectedDate(dateKey(day));
    if (!isSameMonth(day, viewMonth)) {
      setViewMonth(startOfMonth(day));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Production Calendar</h2>
        <p>View wash, distillation, barrel, bottling, and blend activity by date and status</p>
      </div>

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setViewMonth((m) => subMonths(m, 1))}
            aria-label="Previous month"
          >
            ←
          </button>
          <h3 className="calendar-month-label">{format(viewMonth, 'MMMM yyyy')}</h3>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            →
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const today = new Date();
              setViewMonth(startOfMonth(today));
              setSelectedDate(dateKey(today));
            }}
          >
            Today
          </button>
        </div>
        <p className="calendar-month-summary text-muted">
          {monthEventCount} {monthEventCount === 1 ? 'activity' : 'activities'} this month
        </p>
      </div>

      <div className="calendar-filters">
        {ALL_KINDS.map((kind) => (
          <label key={kind} className={`calendar-filter-chip calendar-kind-${kind}`}>
            <input
              type="checkbox"
              checked={enabledKinds.has(kind)}
              onChange={() => toggleKind(kind)}
            />
            {CALENDAR_KIND_LABELS[kind]}
          </label>
        ))}
      </div>

      <div className="calendar-layout">
        <div className="calendar-grid-wrap card">
          <div className="calendar-weekdays">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="calendar-weekday">{label}</div>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day) => {
              const key = dateKey(day);
              const dayEvents = eventsByDate.get(key) ?? [];
              const inMonth = isSameMonth(day, viewMonth);
              const selected = key === selectedDate;
              const today = isToday(day);

              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    'calendar-day',
                    !inMonth && 'calendar-day-outside',
                    selected && 'calendar-day-selected',
                    today && 'calendar-day-today',
                  ].filter(Boolean).join(' ')}
                  onClick={() => selectDay(day)}
                >
                  <span className="calendar-day-number">{format(day, 'd')}</span>
                  {dayEvents.length > 0 && (
                    <div className="calendar-day-events">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span
                          key={event.id}
                          className={`calendar-event-dot calendar-kind-${event.kind}`}
                          title={`${CALENDAR_KIND_LABELS[event.kind]}: ${event.title}`}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="calendar-event-more">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
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
          {ALL_KINDS.map((kind) => (
            <span key={kind} className="calendar-legend-item">
              <span className={`calendar-event-dot calendar-kind-${kind}`} />
              {CALENDAR_KIND_LABELS[kind]}
            </span>
          ))}
        </div>
      </div>
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
      {event.detail && <p className="calendar-detail-meta text-muted">{event.detail}</p>}
    </li>
  );
}
