import {
  defaultHomeBatchCostState,
  HOME_BATCH_COST_STORAGE_KEY,
  type HomeBatchCostState,
} from './home-batch-cost';

export function loadHomeBatchCostState(): HomeBatchCostState {
  if (typeof localStorage === 'undefined') return defaultHomeBatchCostState();
  try {
    const raw = localStorage.getItem(HOME_BATCH_COST_STORAGE_KEY);
    if (!raw) return defaultHomeBatchCostState();
    const parsed = JSON.parse(raw) as HomeBatchCostState;
    if (!parsed || !Array.isArray(parsed.washes)) return defaultHomeBatchCostState();
    return {
      allocMode: parsed.allocMode === 'laa' ? 'laa' : 'volume',
      washes: parsed.washes ?? [],
      distills: parsed.distills ?? [],
      blends: parsed.blends ?? [],
      bottlings: parsed.bottlings ?? [],
    };
  } catch {
    return defaultHomeBatchCostState();
  }
}

export function saveHomeBatchCostState(state: HomeBatchCostState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(HOME_BATCH_COST_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}
