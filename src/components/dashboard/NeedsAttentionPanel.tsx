import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCalendarDay } from '../../lib/date-input';
import {
  ATTENTION_CATEGORY_LABELS,
  countBySeverity,
  type AttentionItem,
  type AttentionSeverity,
} from '../../lib/dashboard/attention';

const SEVERITY_LABELS: Record<AttentionSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Check',
};

const COLLAPSED_COUNT = 6;

export function NeedsAttentionPanel({ items }: { items: AttentionItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const counts = countBySeverity(items);
  const shown = showAll ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <section className="dash-panel dash-attention" data-testid="dashboard-needs-attention" aria-labelledby="dash-attention-title">
      <header className="dash-panel-header">
        <h3 id="dash-attention-title" className="dash-panel-title">Needs attention</h3>
        <div className="dash-severity-counts" aria-label="Alert counts">
          {(['critical', 'warning', 'info'] as AttentionSeverity[]).map((severity) => (
            <span key={severity} className={`dash-severity-chip dash-severity-${severity}`}>
              {counts[severity]} {SEVERITY_LABELS[severity].toLowerCase()}
            </span>
          ))}
        </div>
      </header>
      {items.length === 0 ? (
        <p className="dash-empty" data-testid="dashboard-attention-empty">
          Nothing needs attention. No low stock, missed fermenter checks, incomplete records, or variance over the limits.
        </p>
      ) : (
        <>
          <ul className="dash-attention-list">
            {shown.map((item) => (
              <li key={item.key} className={`dash-attention-item dash-severity-border-${item.severity}`}>
                <Link to={item.href} className="dash-attention-link" data-testid={`attention-${item.key}`}>
                  <span className={`dash-severity-tag dash-severity-${item.severity}`}>
                    {SEVERITY_LABELS[item.severity]}
                  </span>
                  <span className="dash-attention-body">
                    <span className="dash-attention-title">{item.title}</span>
                    <span className="dash-attention-detail">{item.detail}</span>
                  </span>
                  <span className="dash-attention-meta">
                    <span>{ATTENTION_CATEGORY_LABELS[item.category]}</span>
                    {item.occurredAt && <span>{formatCalendarDay(item.occurredAt)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {items.length > COLLAPSED_COUNT && (
            <button type="button" className="btn btn-sm btn-ghost dash-show-all" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
