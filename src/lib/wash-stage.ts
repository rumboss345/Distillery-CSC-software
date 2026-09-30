import type { FermentationAssignmentStatus, MashStatus } from '../types';

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

/**
 * The wash batch status follows its fermenters.
 * Any fermenter still fermenting keeps the wash fermenting.
 * Removing the last fermenter from a fermenting wash sends it back to washing.
 */
export function mashStatusFromFermentations(
  current: MashStatus,
  fermentations: FermentationAssignmentStatus[],
): MashStatus {
  if (fermentations.length === 0) {
    if (current === 'fermenting') return 'mashing';
    return current;
  }
  if (fermentations.some((status) => status === 'fermenting')) return 'fermenting';
  if (fermentations.some((status) => status === 'complete')) return 'complete';
  return 'discarded';
}
