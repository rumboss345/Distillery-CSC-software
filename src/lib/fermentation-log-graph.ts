import { format } from 'date-fns';
import { formatRecordedAt, parseStoredDate } from './date-input';
import { estimateAbvFromBrix, FERMENTATION_READY_MAX_BRIX } from './fermentation';

export type FermentationGraphMeasure = 'brix' | 'temperature' | 'abv' | 'ph';

export interface FermentationLogReading {
  logged_at: string;
  temperature_f: number | null;
  brix: number | null;
  ph: number | null;
}

export interface FermentationGraphPoint {
  loggedAt: string;
  timeMs: number;
  brix: number | null;
  temperature: number | null;
  abv: number | null;
  ph: number | null;
}

export interface GraphAxis {
  min: number;
  max: number;
  ticks: number[];
}

export const FERMENTATION_GRAPH_MEASURES: { id: FermentationGraphMeasure; label: string }[] = [
  { id: 'brix', label: 'Brix' },
  { id: 'temperature', label: 'Temp (°F)' },
  { id: 'abv', label: 'Est. ABV' },
  { id: 'ph', label: 'pH' },
];

export function fermentationGraphPoints(
  logs: FermentationLogReading[],
  startBrix: number | null,
): FermentationGraphPoint[] {
  return logs
    .map((log) => {
      const parsed = parseStoredDate(log.logged_at);
      const brix = finite(log.brix);
      return {
        loggedAt: log.logged_at,
        timeMs: parsed?.getTime() ?? Number.NaN,
        brix,
        temperature: finite(log.temperature_f),
        ph: finite(log.ph),
        abv: brix != null && startBrix != null ? estimateAbvFromBrix(startBrix, brix) : null,
      };
    })
    .filter((point) => Number.isFinite(point.timeMs))
    .sort((a, b) => a.timeMs - b.timeMs || a.loggedAt.localeCompare(b.loggedAt));
}

export function availableFermentationMeasures(
  points: FermentationGraphPoint[],
): FermentationGraphMeasure[] {
  return FERMENTATION_GRAPH_MEASURES
    .map((measure) => measure.id)
    .filter((id) => points.some((point) => point[id] != null));
}

export function fermentationGraphSummary(
  points: FermentationGraphPoint[],
  measure: FermentationGraphMeasure,
): string {
  const readings = points.filter((point) => point[measure] != null);
  if (readings.length === 0) return 'No readings for this measure.';
  const first = readings[0];
  const last = readings[readings.length - 1];
  const startValue = formatFermentationGraphValue(measure, first[measure] as number);
  const startWhen = formatRecordedAt(first.loggedAt);
  if (readings.length === 1) {
    return `One reading: ${startValue} on ${startWhen}.`;
  }
  const endValue = formatFermentationGraphValue(measure, last[measure] as number);
  const endWhen = formatRecordedAt(last.loggedAt);
  if (Math.abs((first[measure] as number) - (last[measure] as number)) < 0.05) {
    return `${startValue} from ${startWhen} through ${endWhen}.`;
  }
  return `${startValue} on ${startWhen} to ${endValue} on ${endWhen}.`;
}

export function formatFermentationGraphValue(measure: FermentationGraphMeasure, value: number): string {
  const text = trimReading(value);
  switch (measure) {
    case 'brix': return `${text}° Brix`;
    case 'temperature': return `${text}°F`;
    case 'abv': return `${value.toFixed(1)}% ABV`;
    case 'ph': return `pH ${text}`;
  }
}

export function fermentationMeasureAxis(
  measure: FermentationGraphMeasure,
  values: number[],
): GraphAxis {
  if (measure === 'brix') {
    return graphAxis(values, { include: [0, FERMENTATION_READY_MAX_BRIX], floor: 0 });
  }
  if (measure === 'abv') return graphAxis(values, { include: [0], floor: 0 });
  return graphAxis(values);
}

export function fermentationAxisLabel(timeMs: number, spanMs: number, sameDay: boolean): string {
  const date = new Date(timeMs);
  if (spanMs > 0 && spanMs < 36 * 60 * 60 * 1000) {
    return sameDay ? format(date, 'HH:mm') : format(date, 'MMM d HH:mm');
  }
  return format(date, 'MMM d');
}

export function graphLabelIndexes(count: number): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  if (count <= 6) return Array.from({ length: count }, (_, index) => index);
  const indexes = new Set([0, count - 1]);
  for (let step = 1; step <= 3; step += 1) {
    indexes.add(Math.round((step * (count - 1)) / 4));
  }
  return [...indexes].sort((a, b) => a - b);
}

export function graphAxis(
  values: number[],
  options?: { include?: number[]; floor?: number },
): GraphAxis {
  const nums = [...values, ...(options?.include ?? [])].filter((value) => Number.isFinite(value));
  if (nums.length === 0) return { min: 0, max: 1, ticks: [0, 1] };

  let lo = Math.min(...nums);
  let hi = Math.max(...nums);
  if (hi - lo < 1e-9) {
    const pad = Math.max(Math.abs(lo) * 0.15, 1);
    lo -= pad;
    hi += pad;
  } else {
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
  }

  const rough = (hi - lo) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-9)));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = nice * magnitude;
  let min = Math.floor((lo + step * 1e-9) / step) * step;
  const max = Math.ceil((hi - step * 1e-9) / step) * step;
  if (options?.floor != null && min < options.floor) min = options.floor;

  const count = Math.max(1, Math.round((max - min) / step));
  const ticks = Array.from({ length: count + 1 }, (_, index) => roundTick(min + index * step));
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

function finite(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function trimReading(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function roundTick(value: number): number {
  return Math.round(value * 1000) / 1000;
}
