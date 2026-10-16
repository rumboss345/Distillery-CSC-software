export type ProductivityMetric = 'heartsGal' | 'pureAlcoholGal' | 'bottles' | 'runs';

export interface MonthlyProduction {
  /** YYYY-MM */
  month: string;
  heartsGal: number;
  pureAlcoholGal: number;
  bottles: number;
  runs: number;
}

export interface ProductivityMonthBar {
  label: string;
  current: number;
  previous: number;
}

export interface ProductivityComparison {
  year: number;
  previousYear: number;
  metric: ProductivityMetric;
  months: ProductivityMonthBar[];
  currentTotal: number;
  previousTotal: number;
  summary: string;
}

export const PRODUCTIVITY_METRICS: { id: ProductivityMetric; label: string; hint: string }[] = [
  {
    id: 'heartsGal',
    label: 'Hearts',
    hint: 'Gallons of hearts, dated by the distillation run. A run still in progress is included.',
  },
  {
    id: 'pureAlcoholGal',
    label: 'Pure alcohol',
    hint: 'Alcohol gallons in the hearts: volume multiplied by ABV.',
  },
  {
    id: 'bottles',
    label: 'Bottles',
    hint: 'Bottles filled, dated by the bottling run. Packaging lines are used when the run has them.',
  },
  {
    id: 'runs',
    label: 'Completed runs',
    hint: 'Distillation runs marked complete, dated by the run date.',
  },
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function productivityYearOptions(rows: MonthlyProduction[], todayYear: number): number[] {
  const years = rows
    .map((row) => Number(row.month.slice(0, 4)))
    .filter((year) => year >= 1900 && year <= 9999);
  const earliest = years.length > 0 ? Math.min(...years, todayYear) : todayYear;
  const latest = Math.max(todayYear, earliest, ...years);
  const options: number[] = [];
  for (let year = latest; year >= earliest; year -= 1) options.push(year);
  return options;
}

export function defaultProductivityYear(rows: MonthlyProduction[], todayYear: number): number {
  const options = productivityYearOptions(rows, todayYear);
  const thisYearHasProduction = rows.some(
    (row) => row.month.startsWith(`${todayYear}-`) && rowHasProduction(row),
  );
  if (thisYearHasProduction) return todayYear;
  const latestWithProduction = options.find((year) => rows.some(
    (row) => row.month.startsWith(`${year}-`) && rowHasProduction(row),
  ));
  return latestWithProduction ?? todayYear;
}

export function compareProductivityYears(
  rows: MonthlyProduction[],
  year: number,
  metric: ProductivityMetric,
): ProductivityComparison {
  const months = MONTH_LABELS.map((label, index) => {
    const month = String(index + 1).padStart(2, '0');
    return {
      label,
      current: monthTotal(rows, `${year}-${month}`, metric),
      previous: monthTotal(rows, `${year - 1}-${month}`, metric),
    };
  });
  const currentTotal = months.reduce((sum, month) => sum + month.current, 0);
  const previousTotal = months.reduce((sum, month) => sum + month.previous, 0);
  const comparison = {
    year,
    previousYear: year - 1,
    metric,
    months,
    currentTotal,
    previousTotal,
    summary: '',
  };
  comparison.summary = productivitySummary(comparison);
  return comparison;
}

export function productivitySummary(comparison: Omit<ProductivityComparison, 'summary'>): string {
  const { year, previousYear, metric, currentTotal, previousTotal } = comparison;
  const current = amountPhrase(metric, currentTotal);
  const previous = amountPhrase(metric, previousTotal);
  const noun = metricNoun(metric);

  if (currentTotal <= 0 && previousTotal <= 0) {
    return `No ${noun} recorded in ${year} or ${previousYear}.`;
  }
  if (previousTotal <= 0) {
    return `${current} in ${year}. ${previousYear} has none recorded.`;
  }
  if (currentTotal <= 0) {
    return `No ${noun} recorded in ${year}. ${previousYear} had ${previous}.`;
  }

  const delta = currentTotal - previousTotal;
  if (sameAmount(metric, delta)) {
    return `${current} in ${year}, the same as ${previousYear}.`;
  }

  const direction = delta > 0 ? 'more' : 'less';
  const difference = differencePhrase(metric, Math.abs(delta));
  const percent = Math.abs(delta / previousTotal) * 100;
  const percentLabel = percent >= 10
    ? `${Math.round(percent)}%`
    : `${percent.toFixed(1)}%`;
  const percentText = percentLabel === '0.0%' ? '' : `, ${percentLabel}`;
  return `${current} in ${year}, compared with ${previous} in ${previousYear} (${difference} ${direction}${percentText}).`;
}

export function formatProductivityAmount(metric: ProductivityMetric, value: number): string {
  if (metric === 'bottles' || metric === 'runs') {
    return Math.round(value).toLocaleString('en-US');
  }
  const digits = metric === 'pureAlcoholGal' ? 2 : 1;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function chartAxis(peak: number): { max: number; ticks: number[] } {
  if (!(peak > 0)) return { max: 1, ticks: [0, 1] };
  const padded = peak * 1.08;
  const roughStep = padded / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = nice * magnitude;
  const max = Math.ceil((padded - step * 1e-9) / step) * step;
  const count = Math.max(1, Math.round(max / step));
  const ticks = Array.from({ length: count + 1 }, (_, index) => (
    Math.round(index * step * 1000) / 1000
  ));
  return { max, ticks };
}

export function formatAxisTick(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function rowHasProduction(row: MonthlyProduction): boolean {
  return row.heartsGal > 0 || row.pureAlcoholGal > 0 || row.bottles > 0 || row.runs > 0;
}

function monthTotal(rows: MonthlyProduction[], month: string, metric: ProductivityMetric): number {
  return rows.reduce((sum, row) => (row.month === month ? sum + row[metric] : sum), 0);
}

function metricNoun(metric: ProductivityMetric): string {
  switch (metric) {
    case 'heartsGal': return 'hearts';
    case 'pureAlcoholGal': return 'pure alcohol';
    case 'bottles': return 'bottles';
    case 'runs': return 'completed runs';
  }
}

function differencePhrase(metric: ProductivityMetric, value: number): string {
  const amount = formatProductivityAmount(metric, value);
  if (metric === 'heartsGal' || metric === 'pureAlcoholGal') return `${amount} gal`;
  if (metric === 'bottles') return `${amount} bottles`;
  return `${amount} runs`;
}

function amountPhrase(metric: ProductivityMetric, value: number): string {
  const amount = formatProductivityAmount(metric, value);
  switch (metric) {
    case 'heartsGal': return `${amount} gal of hearts`;
    case 'pureAlcoholGal': return `${amount} gal of pure alcohol`;
    case 'bottles': return `${amount} bottles`;
    case 'runs': return `${amount} completed runs`;
  }
}

function sameAmount(metric: ProductivityMetric, delta: number): boolean {
  return metric === 'bottles' || metric === 'runs'
    ? Math.abs(delta) < 0.5
    : Math.abs(delta) < 0.05;
}
