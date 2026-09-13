import type { DistillationRunType } from '../types';

export const RUN_TYPE_LABELS: Record<DistillationRunType, string> = {
  wash: 'Low Wine Rum',
  low_wines: 'Spirit Run',
  heavy_rum: 'Heavy Rum',
};

export const RUN_TYPE_BUTTON_LABELS: Record<DistillationRunType, string> = {
  wash: '+ Low Wine Rum',
  low_wines: '+ Spirit Run',
  heavy_rum: '+ Heavy Rum',
};

export const ALL_RUN_TYPES: DistillationRunType[] = ['wash', 'low_wines', 'heavy_rum'];

export function isFermenterSourcedRun(runType: DistillationRunType): boolean {
  return runType === 'wash';
}

export function isTankSourcedRun(runType: DistillationRunType): boolean {
  return runType === 'low_wines' || runType === 'heavy_rum';
}

export function runTypeLabel(runType: DistillationRunType | string | undefined): string {
  const key = (runType ?? 'wash') as DistillationRunType;
  return RUN_TYPE_LABELS[key] ?? String(runType);
}
