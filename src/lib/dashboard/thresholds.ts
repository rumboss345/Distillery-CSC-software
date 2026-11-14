/** Dashboard alert limits. Administrators change them on the Administration page. */
export interface DashboardThresholds {
  /** A fermenting vessel with no log for this many hours is a missed check. Twice this is critical. */
  fermenterCheckHours: number;
  /** Blend finished volume more than this % away from the planned volume. */
  blendVolumeVariancePct: number;
  /** Bottling volume or pure-alcohol variance at or above this many US gallons. */
  bottlingVarianceGal: number;
  /** Measured ABV this many percentage points away from the planned ABV. */
  abvVariancePoints: number;
  /** Distillation runs still running after this many days. */
  longRunningRunDays: number;
}

export const DASHBOARD_THRESHOLDS_SETTING_KEY = 'dashboard_alert_thresholds';

export const DEFAULT_DASHBOARD_THRESHOLDS: DashboardThresholds = {
  fermenterCheckHours: 24,
  blendVolumeVariancePct: 5,
  bottlingVarianceGal: 0.25,
  abvVariancePoints: 0.3,
  longRunningRunDays: 2,
};

const LIMITS: Record<keyof DashboardThresholds, { min: number; max: number }> = {
  fermenterCheckHours: { min: 1, max: 336 },
  blendVolumeVariancePct: { min: 0.1, max: 50 },
  bottlingVarianceGal: { min: 0.01, max: 50 },
  abvVariancePoints: { min: 0.05, max: 10 },
  longRunningRunDays: { min: 1, max: 30 },
};

export const DASHBOARD_THRESHOLD_LABELS: Record<keyof DashboardThresholds, string> = {
  fermenterCheckHours: 'Hours without a fermenter check',
  blendVolumeVariancePct: 'Blend volume variance (%)',
  bottlingVarianceGal: 'Bottling variance (US gal)',
  abvVariancePoints: 'Measured vs planned ABV (% points)',
  longRunningRunDays: 'Distillation still running after (days)',
};

function clampSetting(key: keyof DashboardThresholds, value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DASHBOARD_THRESHOLDS[key];
  const { min, max } = LIMITS[key];
  return Math.min(max, Math.max(min, parsed));
}

/** Read stored thresholds. Missing or bad values fall back to the defaults. */
export function parseDashboardThresholds(raw: unknown): DashboardThresholds {
  let source: Record<string, unknown> = {};
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') source = parsed as Record<string, unknown>;
    } catch {
      source = {};
    }
  } else if (raw && typeof raw === 'object') {
    source = raw as Record<string, unknown>;
  }
  const result = { ...DEFAULT_DASHBOARD_THRESHOLDS };
  for (const key of Object.keys(DEFAULT_DASHBOARD_THRESHOLDS) as (keyof DashboardThresholds)[]) {
    if (source[key] !== undefined) result[key] = clampSetting(key, source[key]);
  }
  return result;
}
