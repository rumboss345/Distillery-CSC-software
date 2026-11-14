import { Link } from 'react-router-dom';
import { formatCalendarDay } from '../../lib/date-input';
import type { DashboardThresholds } from '../../lib/dashboard/thresholds';
import type { BlendReportRow } from '../../lib/reporting/blend-rows';
import type { BottlingReportRow } from '../../lib/reporting/bottling-rows';
import { formatVolumeInUnit, volumeInUnit, displayUnitShort, type DisplayVolumeUnit } from '../../lib/reporting/alcohol-units';

function signed(value: number, decimals: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}`;
}

function VarianceCell({
  gal,
  pct,
  unit,
  over,
}: {
  gal: number | null;
  pct: number | null;
  unit: DisplayVolumeUnit;
  over: boolean;
}) {
  if (gal == null) return <td className="num text-muted">—</td>;
  return (
    <td className={`num${over ? ' dash-over-limit' : ''}`}>
      {signed(volumeInUnit(gal, unit), 2)} {displayUnitShort(unit)}
      {pct != null && <div className="dash-cell-sub">{signed(pct, 1)}%</div>}
    </td>
  );
}

function AbvCell({ planned, measured, points, over }: {
  planned: number | null;
  measured: number | null;
  points: number | null;
  over: boolean;
}) {
  return (
    <td className={`num${over ? ' dash-over-limit' : ''}`}>
      {planned != null ? `${planned.toFixed(2)}%` : '—'}
      <div className="dash-cell-sub">
        {measured != null ? `${measured.toFixed(2)}% measured` : 'Not measured'}
        {points != null ? ` (${signed(points, 2)})` : ''}
      </div>
    </td>
  );
}

export function VariancePanel({
  blends,
  bottlings,
  unit,
  thresholds,
  periodLabel,
}: {
  blends: BlendReportRow[];
  bottlings: BottlingReportRow[];
  unit: DisplayVolumeUnit;
  thresholds: DashboardThresholds;
  periodLabel: string;
}) {
  return (
    <section className="dash-panel" data-testid="dashboard-variance" aria-labelledby="dash-variance-title">
      <header className="dash-panel-header">
        <h3 id="dash-variance-title" className="dash-panel-title">Blending & bottling variance</h3>
        <span className="dash-panel-period">{periodLabel}</span>
      </header>
      <p className="dash-panel-note">
        Expected volume is the planned blend volume, or the tank draw less spirit sent back for bottling.
        Measured ABVs are corrected to 60 °F. Highlighted rows are past the alert limits set by an administrator.
      </p>

      <h4 className="dash-subtitle">Blends</h4>
      {blends.length === 0 ? (
        <p className="dash-empty">No executed blends in this period.</p>
      ) : (
        <div className="table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Blend</th>
                <th className="num">Expected</th>
                <th className="num">Actual</th>
                <th className="num">Difference</th>
                <th className="num">ABV planned / measured</th>
              </tr>
            </thead>
            <tbody>
              {blends.map((row) => (
                <tr key={row.blend_id}>
                  <td>
                    <Link to={`/blending?record=${row.blend_id}`}><strong>{row.batch_number}</strong></Link>
                    <div className="dash-cell-sub">{row.product_name} · {formatCalendarDay(row.executed_at ?? row.blend_date)}</div>
                  </td>
                  <td className="num">{row.theoretical_volume_gal != null ? formatVolumeInUnit(row.theoretical_volume_gal, unit, 2) : '—'}</td>
                  <td className="num">{formatVolumeInUnit(row.actual_volume_gal, unit, 2)}</td>
                  <VarianceCell
                    gal={row.volume_variance_gal}
                    pct={row.volume_variance_pct}
                    unit={unit}
                    over={row.volume_variance_pct != null && Math.abs(row.volume_variance_pct) >= thresholds.blendVolumeVariancePct}
                  />
                  <AbvCell
                    planned={row.planned_abv}
                    measured={row.measured_abv}
                    points={row.abv_variance_points}
                    over={row.abv_variance_points != null && Math.abs(row.abv_variance_points) >= thresholds.abvVariancePoints}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="dash-subtitle">Bottling</h4>
      {bottlings.length === 0 ? (
        <p className="dash-empty">No bottling runs in this period.</p>
      ) : (
        <div className="table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Run</th>
                <th className="num">Expected</th>
                <th className="num">Bottled</th>
                <th className="num">Difference</th>
                <th className="num">ABV planned / measured</th>
                <th>Bottles</th>
              </tr>
            </thead>
            <tbody>
              {bottlings.map((row) => (
                <tr key={row.bottling_id}>
                  <td>
                    <Link to={`/bottling?record=${row.bottling_id}`}><strong>{row.batch_number}</strong></Link>
                    <div className="dash-cell-sub">{row.product_name} · {formatCalendarDay(row.bottling_date)}</div>
                  </td>
                  <td className="num">{row.expected_gal != null ? formatVolumeInUnit(row.expected_gal, unit, 2) : '—'}</td>
                  <td className="num">{formatVolumeInUnit(row.bottled_gal, unit, 2)}</td>
                  <VarianceCell
                    gal={row.volume_variance_gal}
                    pct={row.volume_variance_pct}
                    unit={unit}
                    over={row.volume_variance_gal != null && Math.abs(row.volume_variance_gal) >= thresholds.bottlingVarianceGal}
                  />
                  <AbvCell
                    planned={row.final_abv > 0 ? row.final_abv : null}
                    measured={row.measured_abv}
                    points={row.abv_variance_points}
                    over={row.abv_variance_points != null && Math.abs(row.abv_variance_points) >= thresholds.abvVariancePoints}
                  />
                  <td>
                    {row.bottle_sizes.length === 0
                      ? '—'
                      : row.bottle_sizes.map((size) => (
                        <div key={size.sizeMl}>{size.count.toLocaleString()} × {size.sizeMl} ml</div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
