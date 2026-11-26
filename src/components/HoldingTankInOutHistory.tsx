import { getHoldingTankInOutHistory, holdingTankInOutKey } from '../db/queries';
import { inOutVolumeMeta } from '../lib/holding-tank-in-out-detail';
import type { HoldingTankInOutEntry } from '../types';

interface HoldingTankInOutHistoryProps {
  tankId: number | null | undefined;
  limit?: number;
  selectedKey?: string | null;
  onSelect?: (entry: HoldingTankInOutEntry) => void;
  title?: string;
  hint?: string | false;
  emptyMessage?: string;
}

export function HoldingTankInOutHistory({
  tankId,
  limit = 12,
  selectedKey = null,
  onSelect,
  title = 'In and out history',
  hint,
  emptyMessage,
}: HoldingTankInOutHistoryProps) {
  if (!tankId) return null;

  const history = getHoldingTankInOutHistory(tankId, limit);
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
    : hint ?? (onSelect ? 'Click an entry for batch, counterpart, proof gallons, and links.' : undefined);

  return (
    <div className="tank-intake-history">
      <p className="tank-intake-history-title">{title}</p>
      <ul className="tank-intake-history-list">
        {history.map((entry) => {
          const key = holdingTankInOutKey(entry);
          const selected = selectedKey === key;
          return (
            <li key={key}>
              <button
                type="button"
                className={`tank-intake-history-item${selected ? ' selected' : ''}`}
                onClick={() => onSelect?.(entry)}
                aria-pressed={selected}
              >
                <span className="tank-intake-history-summary">
                  <span
                    className={`tank-in-out-badge tank-in-out-badge--${entry.direction}`}
                  >
                    {entry.direction === 'in' ? 'In' : 'Out'}
                  </span>
                  {' '}
                  {entry.summary.replace(/^(In|Out) · /, '')}
                </span>
                <span className="tank-intake-history-meta">
                  {inOutVolumeMeta(entry)}
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