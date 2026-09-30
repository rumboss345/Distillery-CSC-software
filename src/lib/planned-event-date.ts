import { format } from 'date-fns';

/** Local calendar day as `YYYY-MM-DD`. */
export function localIsoDate(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

/** Local date and time as `YYYY-MM-DDTHH:mm`. */
export function localIsoDateTime(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd'T'HH:mm");
}

/**
 * A planned wash or distillation record keeps its scheduled date.
 * Leaving planned stamps the date to the day the status changed.
 */
export function eventDateWhenLeavingPlanned(
  previousStatus: string | null | undefined,
  nextStatus: string,
  currentDate: string,
  today: string = localIsoDate(),
): string {
  if (previousStatus === 'planned' && nextStatus !== 'planned') {
    return today;
  }
  return currentDate;
}
