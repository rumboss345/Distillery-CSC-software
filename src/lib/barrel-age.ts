import { differenceInCalendarDays, format, intervalToDuration, parseISO, subDays } from 'date-fns';
import { isIsoDate } from './date-input';
import { localIsoDate } from './planned-event-date';

export type BarrelAgeParts = {
  years: number;
  months: number;
  days: number;
};

function agePart(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Calendar years, months, and days since fill (fill day = 0 days). */
export function barrelAgeParts(
  fillDate: string,
  today: Date = new Date(),
): BarrelAgeParts | null {
  if (!isIsoDate(fillDate)) return null;
  const start = parseISO(fillDate);
  const end = today;
  if (start > end) return { years: 0, months: 0, days: 0 };
  const duration = intervalToDuration({ start, end });
  return {
    years: duration.years ?? 0,
    months: duration.months ?? 0,
    days: duration.days ?? 0,
  };
}

/** Human-readable age, e.g. "2 years, 3 months, 15 days" (omits zero higher units). */
export function formatBarrelAge(fillDate: string, today?: Date): string | null {
  const parts = barrelAgeParts(fillDate, today);
  if (!parts) return null;
  const bits: string[] = [];
  if (parts.years > 0) bits.push(agePart(parts.years, 'year', 'years'));
  if (parts.months > 0) bits.push(agePart(parts.months, 'month', 'months'));
  if (parts.days > 0 || bits.length === 0) bits.push(agePart(parts.days, 'day', 'days'));
  return bits.join(', ');
}

export type BarrelAgeBarrel = {
  fill_date: string;
  status: string;
  current_volume_gal: number;
};

/** Empty, dumped, or zero-volume cooperage is not aging — show zero until filled again. */
export function barrelIsAgingForAge(barrel: BarrelAgeBarrel): boolean {
  if (barrel.status === 'empty' || barrel.status === 'dumped') return false;
  return barrel.current_volume_gal > 0.01;
}

export function formatBarrelAgeForBarrel(barrel: BarrelAgeBarrel, today?: Date): string {
  if (!barrelIsAgingForAge(barrel)) return '0 days';
  return formatBarrelAge(barrel.fill_date, today) ?? '0 days';
}

export type VolumeWeightedFillSource = {
  volume_gal: number;
  fill_date: string;
};

function calendarAgeDays(fillDate: string, asOfIso: string): number {
  if (!isIsoDate(fillDate) || !isIsoDate(asOfIso)) return 0;
  return Math.max(0, differenceInCalendarDays(parseISO(asOfIso), parseISO(fillDate)));
}

function fillDateFromAgeDays(ageDays: number, asOfIso: string): string {
  if (!isIsoDate(asOfIso)) return asOfIso;
  return format(subDays(parseISO(asOfIso), Math.round(ageDays)), 'yyyy-MM-dd');
}

/** Volume-weighted average aging time expressed as a synthetic fill date. */
export function volumeWeightedAverageFillDate(
  sources: readonly VolumeWeightedFillSource[],
  asOf: Date = new Date(),
): string | null {
  const asOfIso = localIsoDate(asOf);
  let totalVol = 0;
  let weightedAgeDays = 0;
  for (const row of sources) {
    if (!(row.volume_gal > 0) || !isIsoDate(row.fill_date)) continue;
    weightedAgeDays += row.volume_gal * calendarAgeDays(row.fill_date, asOfIso);
    totalVol += row.volume_gal;
  }
  if (!(totalVol > 0)) return null;
  return fillDateFromAgeDays(weightedAgeDays / totalVol, asOfIso);
}

/** After a solera top, carry volume-weighted spirit age (pull barrels) into the receiving barrel. */
export function barrelFillDateAfterSoleraTop(
  volumeBeforeGal: number,
  existingFillDate: string,
  topVolumeGal: number,
  pulledSpiritAverageFillDate: string | null,
  asOf: Date = new Date(),
): string {
  const asOfIso = localIsoDate(asOf);
  const incomingFill = pulledSpiritAverageFillDate && isIsoDate(pulledSpiritAverageFillDate)
    ? pulledSpiritAverageFillDate
    : asOfIso;

  if (volumeBeforeGal <= 0.01) {
    return incomingFill;
  }
  if (!(topVolumeGal > 0)) {
    return isIsoDate(existingFillDate) ? existingFillDate : asOfIso;
  }

  const nextVol = volumeBeforeGal + topVolumeGal;
  const existingAge = calendarAgeDays(existingFillDate, asOfIso);
  const incomingAge = calendarAgeDays(incomingFill, asOfIso);
  const blendedAgeDays = (volumeBeforeGal * existingAge + topVolumeGal * incomingAge) / nextVol;
  return fillDateFromAgeDays(blendedAgeDays, asOfIso);
}