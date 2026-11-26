import { useState } from 'react';
import {
  FERMENTATION_GRAPH_MEASURES,
  availableFermentationMeasures,
  fermentationAxisLabel,
  fermentationGraphBrixValue,
  fermentationGraphPoints,
  fermentationGraphSummary,
  fermentationMeasureAxis,
  formatFermentationGraphValue,
  graphAxis,
  graphLabelIndexes,
  type FermentationGraphMeasure,
  type FermentationGraphSugarScale,
  type FermentationLogReading,
} from '../lib/fermentation-log-graph';
import { brixToSg } from '../lib/fermentation';
import { formatRecordedAt } from '../lib/date-input';
import { getFermentationReadyMaxBrix, useRefreshKey } from '../db/queries';

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const PAD_LEFT = 46;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 36;

export function FermentationLogGraph({
  logs,
  startBrix,
}: {
  logs: FermentationLogReading[];
  startBrix: number | null;
}) {
  const { key: productionRefreshKey } = useRefreshKey();
  void productionRefreshKey;
  const readyMaxBrix = getFermentationReadyMaxBrix();
  const points = fermentationGraphPoints(logs, startBrix);
  const measures = availableFermentationMeasures(points);
  const [measure, setMeasure] = useState<FermentationGraphMeasure>('brix');
  const [brixScale, setBrixScale] = useState<FermentationGraphSugarScale>('brix');
  const selected = measures.includes(measure) ? measure : measures[0];

  if (!selected) return null;

  const summary = fermentationGraphSummary(points, selected);
  const plotValue = (point: (typeof points)[number]): number | null => {
    if (selected !== 'brix') return point[selected] as number | null;
    return point.brix != null ? fermentationGraphBrixValue(point.brix, brixScale) : null;
  };
  const values = points.flatMap((point) => {
    const value = plotValue(point);
    return value != null ? [value] : [];
  });
  const axisInclude = selected === 'brix'
    ? (brixScale === 'gravity' ? [brixToSg(readyMaxBrix), 1] : [readyMaxBrix, 0])
    : undefined;
  const axis = selected === 'brix'
    ? graphAxis(values, { include: axisInclude })
    : fermentationMeasureAxis(selected, values, readyMaxBrix);
  const span = values.length > 0
    ? Math.max(...points.map((point) => point.timeMs)) - Math.min(...points.map((point) => point.timeMs))
    : 0;
  const sameDay = span > 0 && span < 36 * 60 * 60 * 1000
    && new Date(points[0].timeMs).toDateString() === new Date(points[points.length - 1].timeMs).toDateString();

  const plotBottom = CHART_HEIGHT - PAD_BOTTOM;
  const plotHeight = plotBottom - PAD_TOP;
  const plotWidth = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const yFor = (value: number) => {
    const range = axis.max - axis.min || 1;
    return plotBottom - ((value - axis.min) / range) * plotHeight;
  };
  const xFor = (index: number) => {
    if (points.length === 1 || span < 1000) {
      return points.length === 1
        ? PAD_LEFT + plotWidth / 2
        : PAD_LEFT + (index / (points.length - 1)) * plotWidth;
    }
    const start = points[0].timeMs;
    return PAD_LEFT + ((points[index].timeMs - start) / span) * plotWidth;
  };

  const positioned = points.map((point, index) => ({
    ...point,
    x: xFor(index),
    value: plotValue(point),
  }));
  const labelIndexes = new Set(graphLabelIndexes(positioned.length));
  const segments: string[] = [];
  let segment: string[] = [];
  for (const point of positioned) {
    if (point.value == null) {
      if (segment.length > 0) segments.push(segment.join(' '));
      segment = [];
    } else {
      segment.push(`${point.x},${yFor(point.value)}`);
    }
  }
  if (segment.length > 0) segments.push(segment.join(' '));

  const readyPlotValue = selected === 'brix'
    ? (brixScale === 'gravity' ? brixToSg(readyMaxBrix) : readyMaxBrix)
    : null;
  const showReady = selected === 'brix'
    && readyPlotValue != null
    && readyPlotValue >= axis.min
    && readyPlotValue <= axis.max;
  const readyY = showReady && readyPlotValue != null ? yFor(readyPlotValue) : 0;
  const readyLabel = selected === 'brix'
    ? (brixScale === 'gravity'
      ? `Below SG ${brixToSg(readyMaxBrix).toFixed(3)}`
      : `Below ${readyMaxBrix}°`)
    : '';

  return (
    <div className="fermentation-log-graph" data-testid="fermentation-log-graph">
      <div className="fermentation-graph-measures" role="group" aria-label="Graph measure">
        {FERMENTATION_GRAPH_MEASURES.filter((item) => measures.includes(item.id)).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`btn btn-sm btn-secondary${item.id === selected ? ' is-on' : ''}`}
            aria-pressed={item.id === selected}
            onClick={() => setMeasure(item.id)}
          >
            {item.label}
          </button>
        ))}
        {selected === 'brix' && (
          <div className="measure-mode-buttons sugar-scale-buttons fermentation-graph-sugar-scale">
            <button
              type="button"
              className={`btn btn-sm ${brixScale === 'brix' ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={brixScale === 'brix'}
              onClick={() => setBrixScale('brix')}
            >
              Brix
            </button>
            <button
              type="button"
              className={`btn btn-sm ${brixScale === 'gravity' ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={brixScale === 'gravity'}
              onClick={() => setBrixScale('gravity')}
            >
              Specific Gravity
            </button>
          </div>
        )}
      </div>
      <p className="fermentation-graph-summary">{summary}</p>
      <svg
        className="fermentation-graph-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={summary}
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
                className={tick === axis.min ? 'fermentation-graph-baseline' : 'fermentation-graph-grid'}
              />
              <text
                x={PAD_LEFT - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fermentation-graph-axis"
              >
                {formatTick(tick, selected, brixScale)}
              </text>
            </g>
          );
        })}
        {showReady && (
          <g>
            <line
              x1={PAD_LEFT}
              x2={CHART_WIDTH - PAD_RIGHT}
              y1={readyY}
              y2={readyY}
              className="fermentation-graph-ready"
            />
            <text
              x={PAD_LEFT + 8}
              y={Math.min(plotBottom - 8, Math.max(PAD_TOP + 12, readyY - 6))}
              textAnchor="start"
              className="fermentation-graph-ready-label"
            >
              {readyLabel}
            </text>
          </g>
        )}
        {segments.map((pointsAttr, index) => (
          <polyline key={index} points={pointsAttr} className="fermentation-graph-series" />
        ))}
        {positioned.map((point, index) => (
          point.value == null ? null : (
            <circle
              key={`${point.loggedAt}-${index}`}
              cx={point.x}
              cy={yFor(point.value)}
              r={4.5}
              className="fermentation-graph-point"
            >
              <title>{`${formatRecordedAt(point.loggedAt)} · ${formatFermentationGraphValue(selected, point.value, { brixScale, storedBrix: point.brix ?? undefined })}`}</title>
            </circle>
          )
        ))}
        {positioned.map((point, index) => (
          labelIndexes.has(index) ? (
            <text
              key={`label-${point.loggedAt}`}
              x={point.x}
              y={CHART_HEIGHT - 12}
              textAnchor="middle"
              className="fermentation-graph-axis"
            >
              {fermentationAxisLabel(point.timeMs, span, sameDay)}
            </text>
          ) : null
        ))}
      </svg>
    </div>
  );
}

function formatTick(
  value: number,
  measure: FermentationGraphMeasure,
  brixScale: FermentationGraphSugarScale,
): string {
  if (measure === 'brix' && brixScale === 'gravity') {
    return value.toFixed(3);
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
