import { getMutationActorRole } from '../db/mutation-actor';
import { isOwnerRole } from './roles';

/** A planned run does not occupy the still. Only a running run does. */
export function stillRunOccupiesEquipment(status: string): boolean {
  return status === 'running';
}

/**
 * Planned wash batches and distillation runs are view-only.
 * They ignore equipment status and do not lock equipment.
 */
export function plannedRecordSkipsEquipmentStatus(status: string | null | undefined): boolean {
  return status === 'planned';
}

/** Wash and tank draws happen when a run is running or already complete, not while it is only planned. */
export function runConsumesSource(status: string): boolean {
  return status === 'running' || status === 'complete';
}

/** Cuts can be recorded while the run is distilling. Owners may also edit cuts on completed runs. */
export function distillationRunAllowsCutChanges(
  status: string | null | undefined,
  actorRole: string | null | undefined = getMutationActorRole(),
): boolean {
  if (status === 'running') return true;
  if (status === 'complete' && isOwnerRole(actorRole)) return true;
  return false;
}

/** The cuts list opens for a running run and stays available to view after the run is complete. */
export function distillationRunShowsCuts(status: string | null | undefined): boolean {
  return status === 'running' || status === 'complete';
}

/**
 * A running or completed charge already emptied this fermenter.
 * Finishing or editing that run must not wait for the fermenter to be cleaned.
 */
export function fermenterChargeSkipsCleaningGate(
  previousStatus: string | null | undefined,
  previousFermenterId: number | null | undefined,
  nextFermenterId: number | null | undefined,
): boolean {
  if (!nextFermenterId || previousFermenterId !== nextFermenterId) return false;
  return previousStatus === 'running' || previousStatus === 'complete';
}

/** True when charge volume exceeds the still's rated capacity. */
export function chargeExceedsStillCapacity(
  chargeGal: number,
  stillCapacityGal: number | null | undefined,
): boolean {
  if (!(chargeGal > 0)) return false;
  if (stillCapacityGal == null || stillCapacityGal <= 0) return false;
  return chargeGal > stillCapacityGal + 0.0001;
}

export function stillChargeCapacityMessage(
  chargeGal: number,
  stillName: string,
  stillCapacityGal: number,
): string {
  return `Charge volume (${chargeGal} gal) exceeds ${stillName}'s capacity (${stillCapacityGal} gal).`;
}

export function stillAlreadyOccupiedMessage(
  stillName: string,
  batchNumber: string,
  status: string,
  chargeGal: number,
): string {
  const volNote = chargeGal > 0 ? ` with ${chargeGal.toFixed(1)} gal charged` : '';
  return `${stillName} is already in use by run ${batchNumber} (${status})${volNote}. Complete that run or choose another still before charging again.`;
}
