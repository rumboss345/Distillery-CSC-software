import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { getInventoryItems } from '../../db/queries';
import type { BottlingProductPoint, InventoryTrendPoint, ProductionVolumePoint, YieldPoint } from '../../lib/dashboard/charts';
import { loadInventoryTrend } from '../../lib/dashboard/load';
import { chartAxis, formatAxisTick } from '../../lib/reporting/productivity';
import { displayUnitShort, volumeInUnit, type DisplayVolumeUnit } from '../../lib/reporting/alcohol-units';

const WIDTH = 520;
const HEIGHT = 220;
const PAD_LEFT = 48;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 30;

interface BarSeries {
  label: string;
  className: string;
  values: number[];
}

function GroupedBarChart({
  categories,
  series,
  ariaLabel,
  formatValue,
}: {
  categories: string[];
  series: BarSeries[];
  ariaLabel: string;
  formatValue: (value: number) => string;
}) {
  const peak = Math.max(0, ...series.flatMap((row) => row.values));
  const axis = chartAxis(peak);
  const plotBottom = HEIGHT - PAD_BOTTOM;
  const plotHeight = plotBottom - PAD_TOP;
  const groupWidth = (WIDTH - PAD_LEFT - PAD_RIGHT) / Math.max(1, categories.length);
  const barWidth = Math.max(4, (groupWidth * 0.7) / Math.max(1, series.length));
  const yFor = (value: number) => plotBottom - (value / axis.max) * plotHeight;

  return (
    <>
      {series.length > 1 && (
        <div className="dash-chart-legend">
          {series.map((row) => (
            <span key={row.label}><span className={`dash-swatch ${row.className}`} />{row.label}</span>
          ))}
        </div>
      )}
      <svg className="dash-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
        {axis.ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(tick)} y2={yFor(tick)} className={tick === 0 ? 'dash-chart-baseline' : 'dash-chart-grid'} />
            <text x={PAD_LEFT - 6} y={yFor(tick)} textAnchor="end" dominantBaseline="middle" className="dash-chart-axis">
              {formatAxisTick(tick)}
            </text>
          </g>
        ))}
        {categories.map((category, index) => {
          const groupX = PAD_LEFT + index * groupWidth + (groupWidth - barWidth * series.length) / 2;
          return (
            <g key={`${category}-${index}`}>
              {series.map((row, seriesIndex) => {
                const value = row.values[index] ?? 0;
                const y = yFor(value);
                return (
                  <rect
                    key={row.label}
                    x={groupX + seriesIndex * barWidth}
                    y={y}
                    width={barWidth - 1}
                    height={Math.max(0, plotBottom - y)}
                    className={row.className}
                  >
                    <title>{`${category} · ${row.label}: ${formatValue(value)}`}</title>
                  </rect>
                );
              })}
              <text x={PAD_LEFT + index * groupWidth + groupWidth / 2} y={HEIGHT - 10} textAnchor="middle" className="dash-chart-axis">
                {category.length > 12 ? `${category.slice(0, 11)}…` : category}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );
}

function LineChart({ points, ariaLabel, unit }: { points: InventoryTrendPoint[]; ariaLabel: string; unit: string }) {
  const values = points.map((point) => point.quantity);
  const low = Math.min(0, ...values);
  const axis = chartAxis(Math.max(...values, 0) - low);
  const plotBottom = HEIGHT - PAD_BOTTOM;
  const plotHeight = plotBottom - PAD_TOP;
  const step = (WIDTH - PAD_LEFT - PAD_RIGHT) / Math.max(1, points.length - 1);
  const yFor = (value: number) => plotBottom - ((value - low) / axis.max) * plotHeight;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${PAD_LEFT + index * step},${yFor(point.quantity)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  return (
    <svg className="dash-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
      {axis.ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(tick + low)} y2={yFor(tick + low)} className="dash-chart-grid" />
          <text x={PAD_LEFT - 6} y={yFor(tick + low)} textAnchor="end" dominantBaseline="middle" className="dash-chart-axis">
            {formatAxisTick(tick + low)}
          </text>
        </g>
      ))}
      <path d={path} className="dash-chart-line" fill="none" />
      {points.map((point, index) => (
        <circle key={point.date} cx={PAD_LEFT + index * step} cy={yFor(point.quantity)} r={2.5} className="dash-chart-dot">
          <title>{`${format(parseISO(point.date), 'd MMM')}: ${point.quantity.toLocaleString()} ${unit}`}</title>
        </circle>
      ))}
      {points.map((point, index) => (index % labelEvery === 0 || index === points.length - 1 ? (
        <text key={`label-${point.date}`} x={PAD_LEFT + index * step} y={HEIGHT - 10} textAnchor="middle" className="dash-chart-axis">
          {format(parseISO(point.date), 'd MMM')}
        </text>
      ) : null))}
    </svg>
  );
}

function ChartCard({ title, note, empty, children, testId }: {
  title: string;
  note: string;
  empty: string | null;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="dash-chart-card" data-testid={testId}>
      <h4 className="dash-subtitle">{title}</h4>
      <p className="dash-panel-note">{note}</p>
      {empty ? <p className="dash-empty">{empty}</p> : children}
    </div>
  );
}

export function DashboardCharts({
  production,
  bottling,
  yieldPoints,
  unit,
  today,
  periodLabel,
}: {
  production: ProductionVolumePoint[];
  bottling: BottlingProductPoint[];
  yieldPoints: YieldPoint[];
  unit: DisplayVolumeUnit;
  today: string;
  periodLabel: string;
}) {
  const unitShort = displayUnitShort(unit);
  const items = useMemo(() => getInventoryItems(), []);
  const [itemId, setItemId] = useState<number>(() => {
    const low = items.find((item) => item.quantity <= item.reorder_level);
    return (low ?? items[0])?.id ?? 0;
  });
  const selectedItem = items.find((item) => item.id === itemId) ?? null;
  const trend = useMemo(() => (itemId ? loadInventoryTrend(itemId, today) : []), [itemId, today]);
  const trendMoves = trend.length > 1 && trend.some((point) => point.quantity !== trend[0].quantity);

  const hasProduction = production.some((point) => point.heartsGal > 0);
  const hasYield = yieldPoints.some((point) => point.expectedLaaGal > 0);
  const topProducts = bottling.slice(0, 8);

  return (
    <section className="dash-panel" data-testid="dashboard-charts" aria-labelledby="dash-charts-title">
      <header className="dash-panel-header">
        <h3 id="dash-charts-title" className="dash-panel-title">Trends</h3>
      </header>
      <div className="dash-chart-grid">
        <ChartCard
          testId="dashboard-chart-production"
          title={`Hearts collected per month (${unitShort})`}
          note="Hearts cuts by run month, last six months."
          empty={hasProduction ? null : 'No hearts collected in the last six months.'}
        >
          <GroupedBarChart
            categories={production.map((point) => point.label)}
            series={[{ label: 'Hearts', className: 'dash-bar-primary', values: production.map((point) => volumeInUnit(point.heartsGal, unit)) }]}
            ariaLabel="Hearts collected per month"
            formatValue={(value) => `${value.toFixed(1)} ${unitShort}`}
          />
        </ChartCard>

        <ChartCard
          testId="dashboard-chart-bottling"
          title="Bottles filled by product"
          note={`${periodLabel}. Started and finished bottling runs.`}
          empty={topProducts.length > 0 ? null : 'No bottles filled in this period.'}
        >
          <GroupedBarChart
            categories={topProducts.map((point) => point.product)}
            series={[{ label: 'Bottles', className: 'dash-bar-secondary', values: topProducts.map((point) => point.bottles) }]}
            ariaLabel="Bottles filled by product"
            formatValue={(value) => `${value.toLocaleString()} bottles`}
          />
          <ul className="dash-chart-detail">
            {topProducts.map((point) => (
              <li key={point.product}>
                <strong>{point.product}</strong>: {point.sizes.map((size) => `${size.count.toLocaleString()} × ${size.sizeMl} ml`).join(', ')}
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard
          testId="dashboard-chart-yield"
          title={`Distillation yield: charged vs collected (${unitShort} pure alcohol)`}
          note="Finished runs that recorded both figures, last six months."
          empty={hasYield ? null : 'No finished runs with an alcohol balance in the last six months.'}
        >
          <GroupedBarChart
            categories={yieldPoints.map((point) => (point.yieldPct != null ? `${point.label} ${point.yieldPct.toFixed(0)}%` : point.label))}
            series={[
              { label: 'Expected (charged)', className: 'dash-bar-muted', values: yieldPoints.map((point) => volumeInUnit(point.expectedLaaGal, unit)) },
              { label: 'Actual (collected)', className: 'dash-bar-primary', values: yieldPoints.map((point) => volumeInUnit(point.actualLaaGal, unit)) },
            ]}
            ariaLabel="Pure alcohol charged vs collected per month"
            formatValue={(value) => `${value.toFixed(2)} ${unitShort}`}
          />
        </ChartCard>

        <ChartCard
          testId="dashboard-chart-inventory"
          title="Inventory on hand, last 30 days"
          note="Worked back from today's count using the inventory usage log."
          empty={items.length === 0 ? 'No inventory items yet.' : null}
        >
          <label className="dash-inline-select">
            Item
            <select value={itemId} onChange={(event) => setItemId(Number(event.target.value))}>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          {selectedItem && (
            trendMoves ? (
              <LineChart points={trend} unit={selectedItem.unit} ariaLabel={`${selectedItem.name} on hand`} />
            ) : (
              <p className="dash-empty">
                No usage logged for {selectedItem.name} in the last 30 days. On hand: {selectedItem.quantity.toLocaleString()} {selectedItem.unit}.
              </p>
            )
          )}
        </ChartCard>
      </div>
    </section>
  );
}
