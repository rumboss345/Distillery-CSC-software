import { format } from 'date-fns';
import { getHoldingTankIntakeHistory, holdingTankIntakeKey } from '../db/queries';
import type { HoldingTankIntakeEntry } from '../types';

interface HoldingTankIntakeHistoryProps {
  tankId: number | null | undefined;
  limit?: number;
  selectedKey?: string | null;
  onSelect?: (entry: HoldingTankIntakeEntry) => void;
  title?: string;
  hint?: string | false;
  emptyMessage?: string;
}

export function HoldingTankIntakeHistory({
  tankId,
  limit = 5,
  selectedKey = null,
  onSelect,
  title = 'Recent intake',
  hint,
  emptyMessage,
}: HoldingTankIntakeHistoryProps) {
  if (!tankId) return null;

  const history = getHoldingTankIntakeHistory(tankId, limit);
  if (history.length === 0) {
    if (!emptyMessage) return null;
    return (
      <div className="tank-intake-history">
        <p className="tank-intake-history-title">{title}</p>
        <p className="field-hint">{emptyMessage}</p>
      </div>
    );
  }

  const hintText = hint === false
    ? null
    : hint ?? (onSelect ? 'Select an entry to use its volume and ABV.' : 'Click an entry to highlight its source.');

  return (
    <div className="tank-intake-history">
      <p className="tank-intake-history-title">{title}</p>
      <ul className="tank-intake-history-list">
        {history.map((entry) => {
          const key = holdingTankIntakeKey(entry);
          const selected = selectedKey === key;
          const dateLabel = format(new Date(entry.occurred_at), 'MMM d, yyyy');
          return (
            <li key={key}>
              <button
                type="button"
                className={`tank-intake-history-item${selected ? ' selected' : ''}`}
                onClick={() => onSelect?.(entry)}
                aria-pressed={selected}
              >
                <span className="tank-intake-history-summary">{entry.summary}</span>
                <span className="tank-intake-history-meta">
                  {entry.volume_gal.toFixed(1)} gal @ {entry.abv.toFixed(1)}%
                  {' · '}
                  {dateLabel}
                  {entry.detail ? ` · ${entry.detail}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hintText && (
        <p className="field-hint">{hintText}</p>
      )}
    </div>
  );
}
