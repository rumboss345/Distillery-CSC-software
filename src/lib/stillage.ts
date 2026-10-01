import type { DistillationRunType } from '../types';

/** Low wine and heavy rum runs leave spent wash in the still. */
export function runAsksForStillage(runType: DistillationRunType | string | null | undefined): boolean {
  return runType === 'wash' || runType === 'heavy_rum';
}

/** Distillation stillage can be stored only in equipment of type Stillage Tank. */
export function isStillageTankType(type: string | null | undefined): boolean {
  return type === 'stillage_tank';
}

export function distillationStillageTankError(tankName: string): string {
  return `${tankName} is not a stillage tank. Stillage from a distillation can only go into a stillage tank, or be discarded.`;
}

/** Stillage moves only into a stillage tank, and a stillage tank only receives stillage. */
export function stillageTransferError(input: {
  sourceIsStillage: boolean;
  destIsStillageTank: boolean;
  destName: string;
}): string | null {
  if (input.sourceIsStillage && !input.destIsStillageTank) {
    return `${input.destName} is not a stillage tank. Stillage can only be sent to a stillage tank.`;
  }
  if (!input.sourceIsStillage && input.destIsStillageTank) {
    return `${input.destName} only receives stillage.`;
  }
  return null;
}

export interface StillageAnswer {
  status: string;
  runType: string;
  volumeGal: number | null | undefined;
  discarded: boolean;
  tankId: number | null | undefined;
}

export function stillageSaveError(input: StillageAnswer): string | null {
  if (input.status !== 'complete' || !runAsksForStillage(input.runType)) return null;
  const volume = input.volumeGal;
  if (volume == null || Number.isNaN(volume) || volume < 0) {
    return 'Enter how many gallons of stillage are left in the still.';
  }
  if (volume <= 0.001) return null;
  if (input.discarded) return null;
  if (!input.tankId) {
    return 'Choose a stillage tank to store the stillage, or mark it discarded.';
  }
  return null;
}

export function persistedStillage(input: StillageAnswer): {
  volumeGal: number | null;
  discarded: number;
  tankId: number | null;
} {
  if (input.status !== 'complete' || !runAsksForStillage(input.runType)) {
    return { volumeGal: null, discarded: 0, tankId: null };
  }
  const volume = input.volumeGal ?? 0;
  if (volume <= 0.001 || input.discarded) {
    return { volumeGal: volume, discarded: 1, tankId: null };
  }
  return { volumeGal: volume, discarded: 0, tankId: input.tankId ?? null };
}

export function stillageSummary(input: {
  status: string;
  runType: string;
  volumeGal: number | null | undefined;
  discarded: boolean;
  tankName?: string | null;
}): string | null {
  if (input.status !== 'complete' || !runAsksForStillage(input.runType)) return null;
  if (input.volumeGal == null || Number.isNaN(input.volumeGal)) return null;
  const gallons = `${input.volumeGal.toFixed(1)} gal`;
  if (input.volumeGal <= 0.001) return 'No stillage left';
  if (input.discarded) return `Stillage ${gallons} discarded`;
  if (input.tankName) return `Stillage ${gallons} stored in ${input.tankName}`;
  return `Stillage ${gallons} stored`;
}
