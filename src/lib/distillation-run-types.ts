import type { DistillationRunType } from '../types';

export const RUN_TYPE_LABELS: Record<DistillationRunType, string> = {
  wash: 'Low Wine Run',
  low_wines: 'Spirit Run',
  heavy_rum: 'Heavy Rum',
  gin: 'Gin Run',
};

export const RUN_TYPE_BUTTON_LABELS: Record<DistillationRunType, string> = {
  wash: '+ Low Wine Run',
  low_wines: '+ Spirit Run',
  heavy_rum: '+ Heavy Rum',
  gin: '+ Gin Run',
};

export const ALL_RUN_TYPES: DistillationRunType[] = ['wash', 'low_wines', 'heavy_rum', 'gin'];

/** Runs that charge directly from a fermenter (wash batch). */
export function isFermenterSourcedRun(runType: DistillationRunType): boolean {
  return runType === 'wash' || runType === 'heavy_rum';
}

/** Spirit runs and gin runs charge from holding tanks. */
export function isTankSourcedRun(runType: DistillationRunType): boolean {
  return runType === 'low_wines' || runType === 'gin';
}

/** Hearts and tails may go to high-wines storage, same as a spirit run. */
export function isSpiritStyleRun(runType: DistillationRunType | string | null | undefined): boolean {
  return runType === 'low_wines' || runType === 'gin';
}

export function runFormTitle(runType: DistillationRunType): string {
  const label = RUN_TYPE_LABELS[runType];
  return /run$/i.test(label) ? label : `${label} Run`;
}

export function runTypeLabel(runType: DistillationRunType | string | undefined): string {
  const key = (runType ?? 'wash') as DistillationRunType;
  return RUN_TYPE_LABELS[key] ?? String(runType);
}
