import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  formatDateDisplay,
  formatDateTimeDisplay,
  formatMonthDisplay,
  isIsoDate,
  isIsoDateTime,
  isIsoMonth,
  joinDateTime,
  monthStartDate,
  normalizeDateInput,
  normalizeDateTimeInput,
  normalizeMonthInput,
  splitDateTime,
  type DateTimeValue,
  type DateValue,
  type MonthValue,
} from '../lib/date-input';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function usePopoverDismiss(open: boolean, onClose: () => void, containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: Event) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, containerRef]);
}

interface CalendarGridProps {
  viewMonth: Date;
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

function CalendarGrid({
  viewMonth,
  selectedDate,
  onSelect,
  onPrevMonth,
  onNextMonth,
}: CalendarGridProps) {
  const monthStart = startOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();

  return (
    <div className="date-picker-calendar">
      <div className="date-picker-calendar-header">
        <button type="button" className="date-picker-nav" onClick={onPrevMonth} aria-label="Previous month">
          ‹
        </button>
        <span className="date-picker-calendar-title">{format(viewMonth, 'MMMM yyyy')}</span>
        <button type="button" className="date-picker-nav" onClick={onNextMonth} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="date-picker-weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day} className="date-picker-weekday">{day}</span>
        ))}
      </div>
      <div className="date-picker-days">
        {days.map((day) => {
          const inMonth = isSameMonth(day, viewMonth);
          const selected = selectedDate ? isSameDay(day, selectedDate) : false;
          const isToday = isSameDay(day, today);
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={[
                'date-picker-day',
                !inMonth ? 'outside-month' : '',
                selected ? 'selected' : '',
                isToday ? 'today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect(day)}
              tabIndex={-1}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
      <div className="date-picker-calendar-footer">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onSelect(today)}
        >
          Today
        </button>
      </div>
    </div>
  );
}

interface MonthGridProps {
  viewYear: number;
  selectedMonth: Date | null;
  onSelect: (monthIndex: number) => void;
  onPrevYear: () => void;
  onNextYear: () => void;
}

function MonthGrid({
  viewYear,
  selectedMonth,
  onSelect,
  onPrevYear,
  onNextYear,
}: MonthGridProps) {
  return (
    <div className="date-picker-calendar date-picker-month-grid">
      <div className="date-picker-calendar-header">
        <button type="button" className="date-picker-nav" onClick={onPrevYear} aria-label="Previous year">
          ‹
        </button>
        <span className="date-picker-calendar-title">{viewYear}</span>
        <button type="button" className="date-picker-nav" onClick={onNextYear} aria-label="Next year">
          ›
        </button>
      </div>
      <div className="date-picker-months">
        {MONTHS.map((label, index) => {
          const selected = selectedMonth
            ? selectedMonth.getFullYear() === viewYear && selectedMonth.getMonth() === index
            : false;
          const isCurrent = new Date().getFullYear() === viewYear && new Date().getMonth() === index;
          return (
            <button
              key={label}
              type="button"
              className={[
                'date-picker-month',
                selected ? 'selected' : '',
                isCurrent ? 'today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect(index)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DatePickerProps {
  id?: string;
  value: DateValue;
  onChange: (value: DateValue) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = 'YYYY-MM-DD',
  className,
}: DatePickerProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [viewMonth, setViewMonth] = useState(() => (
    isIsoDate(value) ? parseISO(value) : new Date()
  ));

  useEffect(() => {
    setText(value);
    if (isIsoDate(value)) setViewMonth(parseISO(value));
  }, [value]);

  const close = useCallback(() => setOpen(false), []);
  usePopoverDismiss(open, close, containerRef);

  const openCalendar = () => {
    if (disabled) return;
    if (isIsoDate(value)) setViewMonth(parseISO(value));
    setOpen(true);
  };

  const commitText = () => {
    const normalized = normalizeDateInput(text);
    if (normalized === null) {
      setText(value);
      return;
    }
    onChange(normalized);
    setText(normalized);
    if (normalized && isIsoDate(normalized)) setViewMonth(parseISO(normalized));
  };

  const handleSelect = (date: Date) => {
    const next = format(date, 'yyyy-MM-dd');
    onChange(next);
    setText(next);
    setOpen(false);
  };

  const selectedDate = isIsoDate(value) ? parseISO(value) : null;

  return (
    <div ref={containerRef} className={`date-picker${className ? ` ${className}` : ''}`}>
      <div className="date-picker-input-wrap">
        <input
          id={inputId}
          type="text"
          className="date-picker-input"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitText();
              setOpen(false);
            }
          }}
          onClick={openCalendar}
        />
        <button
          type="button"
          className="date-picker-trigger"
          onClick={openCalendar}
          disabled={disabled}
          aria-label="Open calendar"
        >
          <CalendarIcon />
        </button>
      </div>
      {open && (
        <div className="date-picker-popover" role="dialog" aria-label="Choose date">
          <CalendarGrid
            viewMonth={viewMonth}
            selectedDate={selectedDate}
            onSelect={handleSelect}
            onPrevMonth={() => setViewMonth((m) => addMonths(m, -1))}
            onNextMonth={() => setViewMonth((m) => addMonths(m, 1))}
          />
        </div>
      )}
      {isIsoDate(value) && (
        <span className="date-picker-hint">{formatDateDisplay(value)}</span>
      )}
    </div>
  );
}

interface DateTimePickerProps {
  id?: string;
  value: DateTimeValue;
  onChange: (value: DateTimeValue) => void;
  disabled?: boolean;
  className?: string;
}

export function DateTimePicker({
  id,
  value,
  onChange,
  disabled = false,
  className,
}: DateTimePickerProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const { date, time } = splitDateTime(value);
  const [viewMonth, setViewMonth] = useState(() => (
    isIsoDate(date) ? parseISO(date) : new Date()
  ));

  useEffect(() => {
    setText(value);
    if (isIsoDate(date)) setViewMonth(parseISO(date));
  }, [value, date]);

  const close = useCallback(() => setOpen(false), []);
  usePopoverDismiss(open, close, containerRef);

  const openCalendar = () => {
    if (disabled) return;
    if (isIsoDate(date)) setViewMonth(parseISO(date));
    setOpen(true);
  };

  const commitText = () => {
    const normalized = normalizeDateTimeInput(text);
    if (normalized === null) {
      setText(value);
      return;
    }
    onChange(normalized);
    setText(normalized);
  };

  const handleSelectDate = (selected: Date) => {
    const nextDate = format(selected, 'yyyy-MM-dd');
    const next = joinDateTime(nextDate, time);
    onChange(next);
    setText(next);
  };

  const handleTimeChange = (nextTime: string) => {
    const next = joinDateTime(date, nextTime);
    onChange(next);
    setText(next);
  };

  const selectedDate = isIsoDate(date) ? parseISO(date) : null;

  return (
    <div ref={containerRef} className={`date-picker date-picker-datetime${className ? ` ${className}` : ''}`}>
      <div className="date-picker-input-wrap">
        <input
          id={inputId}
          type="text"
          className="date-picker-input"
          value={text}
          placeholder="YYYY-MM-DDTHH:mm"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitText();
              setOpen(false);
            }
          }}
          onClick={openCalendar}
        />
        <button
          type="button"
          className="date-picker-trigger"
          onClick={openCalendar}
          disabled={disabled}
          aria-label="Open calendar"
        >
          <CalendarIcon />
        </button>
      </div>
      {open && (
        <div className="date-picker-popover" role="dialog" aria-label="Choose date and time">
          <CalendarGrid
            viewMonth={viewMonth}
            selectedDate={selectedDate}
            onSelect={handleSelectDate}
            onPrevMonth={() => setViewMonth((m) => addMonths(m, -1))}
            onNextMonth={() => setViewMonth((m) => addMonths(m, 1))}
          />
          <div className="date-picker-time-row">
            <label htmlFor={`${inputId}-time`}>Time</label>
            <input
              id={`${inputId}-time`}
              type="time"
              value={time}
              onChange={(e) => handleTimeChange(e.target.value)}
            />
          </div>
          <div className="date-picker-calendar-footer">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
      {isIsoDateTime(value) && (
        <span className="date-picker-hint">{formatDateTimeDisplay(value)}</span>
      )}
    </div>
  );
}

interface MonthPickerProps {
  id?: string;
  value: MonthValue;
  onChange: (value: MonthValue) => void;
  disabled?: boolean;
  className?: string;
}

export function MonthPicker({
  id,
  value,
  onChange,
  disabled = false,
  className,
}: MonthPickerProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const selectedMonth = isIsoMonth(value) ? monthStartDate(value) : null;
  const [viewYear, setViewYear] = useState(() => selectedMonth?.getFullYear() ?? new Date().getFullYear());

  useEffect(() => {
    setText(value);
    if (isIsoMonth(value)) setViewYear(monthStartDate(value).getFullYear());
  }, [value]);

  const close = useCallback(() => setOpen(false), []);
  usePopoverDismiss(open, close, containerRef);

  const openCalendar = () => {
    if (disabled) return;
    if (isIsoMonth(value)) setViewYear(monthStartDate(value).getFullYear());
    setOpen(true);
  };

  const commitText = () => {
    const normalized = normalizeMonthInput(text);
    if (normalized === null) {
      setText(value);
      return;
    }
    onChange(normalized);
    setText(normalized);
    if (normalized) setViewYear(monthStartDate(normalized).getFullYear());
  };

  const handleSelect = (monthIndex: number) => {
    const next = format(new Date(viewYear, monthIndex, 1), 'yyyy-MM');
    onChange(next);
    setText(next);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`date-picker date-picker-month${className ? ` ${className}` : ''}`}>
      <div className="date-picker-input-wrap">
        <input
          id={inputId}
          type="text"
          className="date-picker-input"
          value={text}
          placeholder="YYYY-MM"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitText();
              setOpen(false);
            }
          }}
          onClick={openCalendar}
        />
        <button
          type="button"
          className="date-picker-trigger"
          onClick={openCalendar}
          disabled={disabled}
          aria-label="Open month picker"
        >
          <CalendarIcon />
        </button>
      </div>
      {open && (
        <div className="date-picker-popover" role="dialog" aria-label="Choose month">
          <MonthGrid
            viewYear={viewYear}
            selectedMonth={selectedMonth}
            onSelect={handleSelect}
            onPrevYear={() => setViewYear((y) => y - 1)}
            onNextYear={() => setViewYear((y) => y + 1)}
          />
        </div>
      )}
      {isIsoMonth(value) && (
        <span className="date-picker-hint">{formatMonthDisplay(value)}</span>
      )}
    </div>
  );
}
