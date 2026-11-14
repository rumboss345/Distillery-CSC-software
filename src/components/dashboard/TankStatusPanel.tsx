import { Link } from 'react-router-dom';
import { formatCalendarDay } from '../../lib/date-input';
import type { TankStatusRow } from '../../lib/dashboard/tanks';
import { formatVolumeInUnit, type DisplayVolumeUnit } from '../../lib/reporting/alcohol-units';

function fillClass(fill: number | null): string {
  if (fill == null) return '';
  if (fill > 100.5) return ' dash-fill-over';
  if (fill >= 90) return ' dash-fill-high';
  return '';
}

export function TankStatusPanel({
  rows,
  unit,
  title = 'Tanks & equipment',
}: {
  rows: TankStatusRow[];
  unit: DisplayVolumeUnit;
  title?: string;
}) {
  return (
    <section className="dash-panel" data-testid="dashboard-tanks" aria-labelledby="dash-tanks-title">
      <header className="dash-panel-header">
        <h3 id="dash-tanks-title" className="dash-panel-title">{title}</h3>
        <Link to="/floor-plan" className="dash-panel-link">Process view</Link>
      </header>
      <p className="dash-panel-note">
        Volumes are book volumes from production records (cuts, transfers, draws). They are not live sensor readings.
        "Last set" is the last time someone measured the tank and set its volume.
      </p>
      {rows.length === 0 ? (
        <p className="dash-empty">No tanks or equipment are set up yet.</p>
      ) : (
        <div className="dash-tank-grid">
          {rows.map((row) => (
            <article key={row.id} className="dash-tank" data-testid={`dashboard-tank-${row.id}`}>
              <header className="dash-tank-head">
                <span className="dash-tank-name">{row.name}</span>
                <span className="dash-tank-status">{row.status_label}</span>
              </header>
              <div className="dash-tank-type">{row.type_label}{row.capacity_gal > 0 ? ` · ${formatVolumeInUnit(row.capacity_gal, unit, 0)}` : ''}</div>
              {row.capacity_gal > 0 && (
                <div
                  className="dash-fill-bar"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, row.fill_pct ?? 0)}
                  aria-label={`${row.name} fill`}
                >
                  <span
                    className={`dash-fill-bar-value${fillClass(row.fill_pct)}`}
                    style={{ width: `${Math.min(100, Math.max(0, row.fill_pct ?? 0))}%` }}
                  />
                </div>
              )}
              <dl className="dash-tank-facts">
                <div>
                  <dt>Book volume</dt>
                  <dd>
                    {row.book_volume_gal > 0.05 ? formatVolumeInUnit(row.book_volume_gal, unit) : 'Empty'}
                    {row.fill_pct != null && row.book_volume_gal > 0.05 ? ` (${row.fill_pct.toFixed(0)}%)` : ''}
                  </dd>
                </div>
                {row.abv != null && row.book_volume_gal > 0.05 && (
                  <div>
                    <dt>ABV</dt>
                    <dd>{row.abv.toFixed(2)}%</dd>
                  </div>
                )}
                {row.contents && (
                  <div>
                    <dt>Contents</dt>
                    <dd>{row.contents}</dd>
                  </div>
                )}
                {row.batch_number && (
                  <div>
                    <dt>Batch</dt>
                    <dd>{row.batch_number}</dd>
                  </div>
                )}
                {row.last_measured_at && (
                  <div>
                    <dt>Last set</dt>
                    <dd>{formatCalendarDay(row.last_measured_at)}</dd>
                  </div>
                )}
              </dl>
              <Link to={row.next_action.href} className={`dash-next-action dash-next-${row.next_action.tone}`}>
                {row.next_action.label}
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
