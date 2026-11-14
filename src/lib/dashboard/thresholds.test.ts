import { describe, expect, it } from 'vitest';
import { DEFAULT_DASHBOARD_THRESHOLDS, parseDashboardThresholds } from './thresholds';

describe('dashboard alert limits', () => {
  it('falls back to the defaults for missing or bad settings', () => {
    expect(parseDashboardThresholds(null)).toEqual(DEFAULT_DASHBOARD_THRESHOLDS);
    expect(parseDashboardThresholds('not json')).toEqual(DEFAULT_DASHBOARD_THRESHOLDS);
    expect(parseDashboardThresholds('{"fermenterCheckHours":"x"}')).toEqual(DEFAULT_DASHBOARD_THRESHOLDS);
  });

  it('reads stored values and keeps them within sensible limits', () => {
    const parsed = parseDashboardThresholds(JSON.stringify({ fermenterCheckHours: 12, blendVolumeVariancePct: 500, abvVariancePoints: 0 }));
    expect(parsed.fermenterCheckHours).toBe(12);
    expect(parsed.blendVolumeVariancePct).toBe(50);
    expect(parsed.abvVariancePoints).toBe(0.05);
    expect(parsed.bottlingVarianceGal).toBe(DEFAULT_DASHBOARD_THRESHOLDS.bottlingVarianceGal);
  });
});
