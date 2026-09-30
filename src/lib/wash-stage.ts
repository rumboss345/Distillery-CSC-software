import type { MashStatus } from '../types';

/** Wash cook statuses edited on the Wash page. */
export const WASH_PAGE_STATUSES: MashStatus[] = ['planned', 'mashing', 'discarded'];

/** Fermentation statuses edited on the Fermentation page. */
export const FERMENTATION_PAGE_STATUSES: MashStatus[] = ['fermenting', 'complete', 'discarded'];

/**
 * A wash batch stays on the Wash page until it is fermenting, finished,
 * or discarded after fermentation logs or fermenter assignments exist.
 */
export function washRecordKind(
  status: MashStatus,
  activity: { hasLogs: boolean; hasAssignments: boolean },
): 'wash' | 'fermentation' {
  if (status === 'fermenting' || status === 'complete') return 'fermentation';
  if (status === 'discarded' && (activity.hasLogs || activity.hasAssignments)) return 'fermentation';
  return 'wash';
}

/** Calendar and shortcuts: fermentation records open the Fermentation page. */
export function washRecordPath(
  status: string,
  activity: { hasLogs: boolean; hasAssignments: boolean } = { hasLogs: false, hasAssignments: false },
): '/wash' | '/fermentation' {
  if (status === 'fermenting' || status === 'complete') return '/fermentation';
  if (status === 'discarded') {
    return washRecordKind(status, activity) === 'fermentation' ? '/fermentation' : '/wash';
  }
  return '/wash';
}
