import { useMemo, useState } from 'react';
import { getMonthlyProduction } from '../../db/queries';
import { downloadCsv, rowsToCsv } from '../../lib/reporting/csv';
import {
  PRODUCTIVITY_METRICS,
  chartAxis,
  compareProductivityYears,
  defaultProductivityYear,
  formatAxisTick,
  formatProductivityAmount,
  productivityYearOptions,
  type ProductivityMetric,
} from '../../lib/reporting/productivity';

const CHART_WIDTH = 760;
const CHART_HEIGHT = 280;
const PAD_LEFT = 52;
const PAD_RIGHT = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 32;

export function ProductivityChart() {
  const rows = getMonthlyProduction();
  const todayYear = new Date().getFullYear();
  const years = productivityYearOptions(rows, todayYear);
  const [year, setYear] = useState(() => defaultProductivityYear(rows, todayYear));
  const [metric, setMetric] = useState<ProductivityMetric>('heartsGal');

  const selectedYear = years.includes(year) ? year : years[0] ?? todayYear;
  const comparison = useMemo(
    () => compareProductivityYears(rows, selectedYear, metric),
    [rows, selectedYear, metric],
  );
  const metricInfo = PRODUCTIVITY_METRICS.find((item) => item.id === metric) ?? PRODUCTIVITY_METRICS[0];
  const hasBars = comparison.currentTotal > 0 || comparison.previousTotal > 0;
  const peak = Math.max(...comparison.months.flatMap((month) => [month.current, month.previous]));
  const axis = chartAxis(peak);
  const currentMonth = selectedYear === todayYear ? new Date().getMonth() : -1;

  const plotBottom = CHART_HEIGHT - PAD_BOTTOM;
  const plotHeight = plotBottom - PAD_TOP;
  const plotWidth = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const groupWidth = plotWidth / comparison.months.length;

  const yFor = (value: number) => plotBottom - (value / axis.max) * plotHeight;

  const exportCsv = () => {
    downloadCsv(
      `productivity-${metric}-${selectedYear}.csv`,
      rowsToCsv(
        ['Month', String(comparison.year), String(comparison.previousYear)],
        comparison.months.map((month) => [
          month.label,
          formatProductivityAmount(metric, month.current),
          formatProductivityAmount(metric, month.previous),
        ]),
      ),
    );
  };

  return (
    <section className="section productivity-chart" data-testid="productivity-chart">
      <div className="report-section-header">
        <div>
          <h3 className="section-title">Productivity</h3>
          <p className="report-section-desc">
            Month to month, and each month beside the same month a year earlier.
            This graph uses every recorded month, separate from the report period above.
          </p>
        </div>
      </div>

      <div className="productivity-toolbar">
        <div className="form-group">
          <label htmlFor="productivity-metric">Measure</label>
          <select
            id="productivity-metric"
            value={metric}
            onChange={(event) => setMetric(event.target.value as ProductivityMetric)}
          >
            {PRODUCTIVITY_METRICS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="productivity-year">Year</label>
          <select
            id="productivity-year"
            value={selectedYear}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((option) => (
              <option key={option} value={option}>{option} and {option - 1}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-secondary" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      <p className="report-section-desc productivity-hint">{metricInfo.hint}</p>
      <p className="productivity-summary" data-testid="productivity-summary">{comparison.summary}</p>

      {hasBars ? (
        <>
          <div className="productivity-legend">
            <span><span className="productivity-swatch current" />{comparison.year}</span>
            <span><span className="productivity-swatch previous" />{comparison.previousYear}</span>
          </div>
          <svg
            className="productivity-svg"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            role="img"
            aria-label={comparison.summary}
          >
            {axis.ticks.map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PAD_LEFT}
                    x2={CHART_WIDTH - PAD_RIGHT}
                    y1={y}
                    y2={y}
                    className={tick === 0 ? 'productivity-baseline' : 'productivity-grid'}
                  />
                  <text x={PAD_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle" className="productivity-axis">
                    {formatAxisTick(tick)}
                  </text>
                </g>
              );
            })}
            {comparison.months.map((month, index) => {
              const center = PAD_LEFT + (index + 0.5) * groupWidth;
              const barWidth = Math.min(16, (groupWidth - 14) / 2);
              const both = month.current > 0 && month.previous > 0;
              const previousX = both ? center - barWidth - 1.5 : center - barWidth / 2;
              const currentX = both ? center + 1.5 : center - barWidth / 2;
              return (
                <g key={month.label}>
                  <Bar
                    x={previousX}
                    width={barWidth}
                    value={month.previous}
                    yFor={yFor}
                    plotBottom={plotBottom}
                    className="bar-previous"
                    label={`${month.label} ${comparison.previousYear}: ${formatProductivityAmount(metric, month.previous)}`}
                  />
                  <Bar
                    x={currentX}
                    width={barWidth}
                    value={month.current}
                    yFor={yFor}
                    plotBottom={plotBottom}
                    className="bar-current"
                    label={`${month.label} ${comparison.year}: ${formatProductivityAmount(metric, month.current)}`}
                  />
                  <text
                    x={center}
                    y={CHART_HEIGHT - 10}
                    textAnchor="middle"
                    className={index === currentMonth ? 'productivity-axis current-month' : 'productivity-axis'}
                  >
                    {month.label}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="table-wrap">
            <table className="productivity-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">{comparison.year}</th>
                  <th className="num">{comparison.previousYear}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.months.map((month, index) => (
                  <tr key={month.label} className={index === currentMonth ? 'current-month' : undefined}>
                    <td>{month.label}</td>
                    <td className="num">{formatProductivityAmount(metric, month.current)}</td>
                    <td className="num">{formatProductivityAmount(metric, month.previous)}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Year</strong></td>
                  <td className="num"><strong>{formatProductivityAmount(metric, comparison.currentTotal)}</strong></td>
                  <td className="num"><strong>{formatProductivityAmount(metric, comparison.previousTotal)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>Choose another measure or year to see recorded production.</p>
        </div>
      )}
    </section>
  );
}

function Bar({
  x,
  width,
  value,
  yFor,
  plotBottom,
  className,
  label,
}: {
  x: number;
  width: number;
  value: number;
  yFor: (value: number) => number;
  plotBottom: number;
  className: string;
  label: string;
}) {
  if (!(value > 0)) return null;
  const y = yFor(value);
  const height = Math.max(2, plotBottom - y);
  return (
    <rect x={x} y={plotBottom - height} width={width} height={height} rx={2} className={className}>
      <title>{label}</title>
    </rect>
  );
}
